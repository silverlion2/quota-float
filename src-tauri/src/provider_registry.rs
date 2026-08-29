use crate::{
    antigravity, claude, codex,
    models::{ProviderSnapshot, UsageWindow},
    qoder, trae, volcengine, workbuddy,
};
use futures_util::future::join_all;
use reqwest::Client;
use std::time::Duration;

const RETRYABLE_STATUSES: [&str; 3] = ["unavailable", "stale", "loading"];
const VALID_STATUSES: [&str; 5] = ["ok", "stale", "loading", "unavailable", "signed_out"];
const MAX_SNAPSHOTS_PER_PROVIDER: usize = 4;
const MAX_PLAN_CHARS: usize = 96;
const MAX_UNIT_CHARS: usize = 32;
const MAX_MESSAGE_CHARS: usize = 240;
const MAX_RESET_EXPIRATIONS: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderKind {
    Codex,
    Claude,
    Qoder,
    Trae,
    WorkBuddy,
    Volcengine,
    Antigravity,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProviderDescriptor {
    pub kind: ProviderKind,
    pub id: &'static str,
    pub display_name: &'static str,
    pub timeout: Duration,
}

pub const PROVIDERS: [ProviderDescriptor; 7] = [
    ProviderDescriptor::new(ProviderKind::Codex, "codex", "CODEX", 15),
    ProviderDescriptor::new(ProviderKind::Claude, "claude", "CLAUDE", 15),
    ProviderDescriptor::new(ProviderKind::Qoder, "qoder", "QODER", 5),
    ProviderDescriptor::new(ProviderKind::Trae, "trae", "TRAE", 15),
    ProviderDescriptor::new(ProviderKind::WorkBuddy, "workbuddy", "WORKBUDDY", 15),
    ProviderDescriptor::new(ProviderKind::Volcengine, "volcengine", "VOLCENGINE", 15),
    ProviderDescriptor::new(ProviderKind::Antigravity, "antigravity", "ANTIGRAVITY", 15),
];

impl ProviderDescriptor {
    const fn new(
        kind: ProviderKind,
        id: &'static str,
        display_name: &'static str,
        timeout_seconds: u64,
    ) -> Self {
        Self {
            kind,
            id,
            display_name,
            timeout: Duration::from_secs(timeout_seconds),
        }
    }

    async fn fetch(self, client: &Client) -> Vec<ProviderSnapshot> {
        let request = async {
            match self.kind {
                ProviderKind::Codex => vec![codex::fetch_snapshot(client).await],
                ProviderKind::Claude => claude::fetch_snapshot(client).await.into_iter().collect(),
                ProviderKind::Qoder => qoder::fetch_snapshot().into_iter().collect(),
                ProviderKind::Trae => trae::fetch_snapshot(client).await.into_iter().collect(),
                ProviderKind::WorkBuddy => workbuddy::fetch_snapshot(client)
                    .await
                    .into_iter()
                    .collect(),
                ProviderKind::Volcengine => {
                    volcengine::fetch_snapshot().await.into_iter().collect()
                }
                ProviderKind::Antigravity => {
                    antigravity::fetch_snapshot().await.into_iter().collect()
                }
            }
        };

        match tokio::time::timeout(self.timeout, request).await {
            Ok(values) => self.conform_batch(values),
            Err(_) => vec![self.failure(
                "unavailable",
                "Provider refresh exceeded its time budget. It will retry automatically.",
            )],
        }
    }

    fn failure(self, status: &str, message: &str) -> ProviderSnapshot {
        ProviderSnapshot::provider_failure(self.id, self.display_name, status, message)
    }

    fn supports_same_cycle_retry(self) -> bool {
        !matches!(
            self.kind,
            ProviderKind::Volcengine | ProviderKind::Antigravity
        )
    }

    fn conform_batch(self, values: Vec<ProviderSnapshot>) -> Vec<ProviderSnapshot> {
        values
            .into_iter()
            .take(MAX_SNAPSHOTS_PER_PROVIDER)
            .map(|snapshot| self.conform(snapshot))
            .collect()
    }

    fn conform(self, mut snapshot: ProviderSnapshot) -> ProviderSnapshot {
        snapshot.provider = self.id.into();
        snapshot.display_name = self.display_name.into();
        snapshot.plan = bounded_text(snapshot.plan, MAX_PLAN_CHARS);
        snapshot.balance_unit = bounded_text(snapshot.balance_unit, MAX_UNIT_CHARS);
        snapshot.short_window = conform_window(snapshot.short_window);
        snapshot.weekly_window = conform_window(snapshot.weekly_window);
        snapshot.monthly_window = conform_window(snapshot.monthly_window);
        snapshot.balance_remaining = snapshot
            .balance_remaining
            .filter(|value| value.is_finite() && *value >= 0.0);
        if snapshot.balance_remaining.is_none() {
            snapshot.balance_unit = None;
        }
        snapshot.reset_credit_expires_at = snapshot
            .reset_credit_expires_at
            .into_iter()
            .filter(|value| chrono::DateTime::parse_from_rfc3339(value).is_ok())
            .take(MAX_RESET_EXPIRATIONS)
            .collect();
        if chrono::DateTime::parse_from_rfc3339(&snapshot.updated_at).is_err() {
            snapshot.updated_at = chrono::Utc::now().to_rfc3339();
        }

        if !VALID_STATUSES.contains(&snapshot.status.as_str()) {
            snapshot.status = "unavailable".into();
            snapshot.message = None;
        }
        if snapshot.status == "ok" {
            snapshot.message = None;
            if !has_measurable_quota(&snapshot) {
                snapshot.status = "unavailable".into();
                snapshot.message = Some(format!(
                    "{} returned no measurable quota data.",
                    self.display_name
                ));
            }
        }
        if snapshot.status != "ok" {
            snapshot.plan = None;
            snapshot.short_window = None;
            snapshot.weekly_window = None;
            snapshot.monthly_window = None;
            snapshot.reset_credits = None;
            snapshot.reset_credit_expires_at.clear();
            snapshot.balance_remaining = None;
            snapshot.balance_unit = None;
            snapshot.message = safe_diagnostic_message(snapshot.message).or_else(|| {
                Some(match snapshot.status.as_str() {
                    "signed_out" => {
                        format!("{} login is unavailable. Sign in again.", self.display_name)
                    }
                    "loading" => format!("{} quota is still loading.", self.display_name),
                    _ => format!("{} quota is temporarily unavailable.", self.display_name),
                })
            });
        }
        snapshot
    }
}

fn bounded_text(value: Option<String>, max_chars: usize) -> Option<String> {
    let value = value?;
    let mut output = String::new();
    let mut previous_was_space = false;
    for character in value.trim().chars() {
        if character.is_whitespace() {
            if !previous_was_space && !output.is_empty() {
                output.push(' ');
            }
            previous_was_space = true;
        } else if !character.is_control() {
            output.push(character);
            previous_was_space = false;
        }
        if output.chars().count() >= max_chars {
            break;
        }
    }
    let output = output.trim().to_string();
    (!output.is_empty()).then_some(output)
}

fn safe_diagnostic_message(value: Option<String>) -> Option<String> {
    let value = bounded_text(value, MAX_MESSAGE_CHARS + 1)?;
    if value.chars().count() > MAX_MESSAGE_CHARS {
        return None;
    }
    let normalized = value.to_ascii_lowercase();
    let sensitive = [
        "access_token",
        "refresh_token",
        "id_token",
        "api_key",
        "authorization:",
        "bearer ",
        "secret://",
        ":\\users\\",
        "/users/",
        "/home/",
    ]
    .iter()
    .any(|marker| normalized.contains(marker));
    if sensitive || normalized.starts_with('{') || normalized.starts_with('[') {
        return None;
    }
    Some(value)
}

fn conform_window(value: Option<UsageWindow>) -> Option<UsageWindow> {
    let mut value = value?;
    if !value.remaining_percent.is_finite() || value.window_seconds == 0 {
        return None;
    }
    value.remaining_percent = value.remaining_percent.clamp(0.0, 100.0);
    value.resets_at = value
        .resets_at
        .filter(|timestamp| chrono::DateTime::parse_from_rfc3339(timestamp).is_ok());
    Some(value)
}

fn has_measurable_quota(snapshot: &ProviderSnapshot) -> bool {
    snapshot.short_window.is_some()
        || snapshot.weekly_window.is_some()
        || snapshot.monthly_window.is_some()
        || snapshot.reset_credits.is_some()
        || snapshot.balance_remaining.is_some()
}

fn batch_is_retryable(values: &[ProviderSnapshot]) -> bool {
    values
        .iter()
        .any(|snapshot| RETRYABLE_STATUSES.contains(&snapshot.status.as_str()))
}

async fn fetch_selected(
    client: &Client,
    providers: impl IntoIterator<Item = ProviderDescriptor>,
) -> Vec<(ProviderKind, Vec<ProviderSnapshot>)> {
    join_all(
        providers
            .into_iter()
            .map(|provider| async move { (provider.kind, provider.fetch(client).await) }),
    )
    .await
}

fn selected_providers(provider_ids: &[String]) -> Vec<ProviderDescriptor> {
    PROVIDERS
        .iter()
        .filter(|provider| provider_ids.iter().any(|id| id == provider.id))
        .copied()
        .collect()
}

async fn collect_providers(
    client: &Client,
    providers: Vec<ProviderDescriptor>,
) -> Vec<ProviderSnapshot> {
    let mut batches = fetch_selected(client, providers.iter().copied()).await;

    for delay in [400_u64, 1_200_u64] {
        let retry = batches
            .iter()
            .filter(|(_, values)| batch_is_retryable(values))
            .filter_map(|(kind, _)| providers.iter().find(|provider| provider.kind == *kind))
            .filter(|provider| provider.supports_same_cycle_retry())
            .copied()
            .collect::<Vec<_>>();
        if retry.is_empty() {
            break;
        }

        tokio::time::sleep(Duration::from_millis(delay)).await;
        for (kind, values) in fetch_selected(client, retry).await {
            if let Some((_, current)) = batches.iter_mut().find(|(current, _)| *current == kind) {
                *current = values;
            }
        }
    }

    providers
        .iter()
        .flat_map(|provider| {
            batches
                .iter()
                .find(|(kind, _)| *kind == provider.kind)
                .into_iter()
                .flat_map(|(_, values)| values.iter().cloned())
        })
        .collect()
}

pub async fn collect(client: &Client) -> Vec<ProviderSnapshot> {
    collect_providers(client, PROVIDERS.to_vec()).await
}

pub async fn collect_selected(client: &Client, provider_ids: &[String]) -> Vec<ProviderSnapshot> {
    collect_providers(client, selected_providers(provider_ids)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(provider: &str, status: &str) -> ProviderSnapshot {
        ProviderSnapshot::provider_failure(provider, provider, status, "fixture")
    }

    fn successful_snapshot() -> ProviderSnapshot {
        ProviderSnapshot {
            provider: "wrong-provider".into(),
            display_name: "WRONG DISPLAY".into(),
            plan: Some(format!("  Pro\nPlan {}  ", "x".repeat(200))),
            short_window: Some(UsageWindow {
                remaining_percent: f64::NAN,
                resets_at: None,
                window_seconds: 18_000,
            }),
            weekly_window: Some(UsageWindow {
                remaining_percent: 140.0,
                resets_at: Some("not-a-date".into()),
                window_seconds: 604_800,
            }),
            monthly_window: None,
            reset_credits: Some(1),
            reset_credit_expires_at: vec![
                "2026-09-01T00:00:00Z".into(),
                "private raw value".into(),
            ],
            balance_remaining: Some(f64::NAN),
            balance_unit: Some("credits".into()),
            updated_at: "not-a-date".into(),
            status: "ok".into(),
            message: Some("raw success detail".into()),
        }
    }

    #[test]
    fn registry_ids_are_unique_and_stable() {
        let ids = PROVIDERS
            .iter()
            .map(|provider| provider.id)
            .collect::<Vec<_>>();
        let mut unique = ids.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(ids.len(), unique.len());
        assert_eq!(
            ids,
            [
                "codex",
                "claude",
                "qoder",
                "trae",
                "workbuddy",
                "volcengine",
                "antigravity"
            ]
        );
    }

    #[test]
    fn only_transient_provider_batches_are_retried() {
        assert!(!batch_is_retryable(&[snapshot("codex", "ok")]));
        assert!(!batch_is_retryable(&[snapshot("codex", "signed_out")]));
        assert!(batch_is_retryable(&[snapshot("codex", "unavailable")]));
        assert!(batch_is_retryable(&[
            snapshot("qoder", "ok"),
            snapshot("qoder", "stale"),
        ]));
    }

    #[test]
    fn descriptors_enforce_finite_provider_time_budgets() {
        assert!(PROVIDERS
            .iter()
            .all(|provider| provider.timeout >= Duration::from_secs(1)
                && provider.timeout <= Duration::from_secs(15)));
    }

    #[test]
    fn selected_providers_are_validated_and_keep_registry_order() {
        let selected = selected_providers(&[
            "antigravity".into(),
            "unknown".into(),
            "codex".into(),
            "codex".into(),
        ]);
        assert_eq!(
            selected
                .iter()
                .map(|provider| provider.id)
                .collect::<Vec<_>>(),
            vec!["codex", "antigravity"]
        );
    }

    #[test]
    fn process_spawning_providers_do_not_retry_in_the_same_cycle() {
        assert!(PROVIDERS
            .iter()
            .find(|provider| provider.kind == ProviderKind::Codex)
            .is_some_and(|provider| provider.supports_same_cycle_retry()));
        for kind in [ProviderKind::Volcengine, ProviderKind::Antigravity] {
            assert!(PROVIDERS
                .iter()
                .find(|provider| provider.kind == kind)
                .is_some_and(|provider| !provider.supports_same_cycle_retry()));
        }
    }

    #[test]
    fn every_adapter_batch_obeys_the_shared_payload_contract() {
        for provider in PROVIDERS {
            let values = provider.conform_batch(vec![successful_snapshot(); 6]);
            assert_eq!(values.len(), MAX_SNAPSHOTS_PER_PROVIDER);
            for snapshot in values {
                assert_eq!(snapshot.provider, provider.id);
                assert_eq!(snapshot.display_name, provider.display_name);
                assert_eq!(snapshot.status, "ok");
                assert!(snapshot
                    .plan
                    .as_deref()
                    .is_some_and(|plan| plan.starts_with("Pro Plan ")));
                assert_eq!(
                    snapshot.plan.as_ref().map(|plan| plan.chars().count()),
                    Some(MAX_PLAN_CHARS)
                );
                assert!(snapshot.short_window.is_none());
                assert_eq!(
                    snapshot
                        .weekly_window
                        .as_ref()
                        .map(|window| window.remaining_percent),
                    Some(100.0)
                );
                assert_eq!(
                    snapshot.weekly_window.and_then(|window| window.resets_at),
                    None
                );
                assert_eq!(snapshot.reset_credit_expires_at, ["2026-09-01T00:00:00Z"]);
                assert!(chrono::DateTime::parse_from_rfc3339(&snapshot.updated_at).is_ok());
                assert!(snapshot.balance_unit.is_none());
                assert!(snapshot.message.is_none());
            }
        }
    }

    #[test]
    fn adapter_failures_drop_payloads_and_redact_sensitive_diagnostics() {
        for provider in PROVIDERS {
            let mut value = successful_snapshot();
            value.status = "unexpected".into();
            value.message = Some(r#"{"access_token":"secret","path":"C:\\Users\\private"}"#.into());
            let snapshot = provider.conform(value);
            let message = snapshot.message.expect("safe fallback message");

            assert_eq!(snapshot.provider, provider.id);
            assert_eq!(snapshot.status, "unavailable");
            assert!(snapshot.plan.is_none());
            assert!(snapshot.short_window.is_none());
            assert!(snapshot.weekly_window.is_none());
            assert!(snapshot.monthly_window.is_none());
            assert!(snapshot.reset_credits.is_none());
            assert!(snapshot.reset_credit_expires_at.is_empty());
            assert!(snapshot.balance_remaining.is_none());
            assert!(snapshot.balance_unit.is_none());
            assert!(!message.to_ascii_lowercase().contains("token"));
            assert!(!message.contains("secret"));
            assert!(!message.contains("Users"));
            assert!(message.chars().count() <= MAX_MESSAGE_CHARS);
        }
    }

    #[test]
    fn ok_snapshots_without_quota_fail_closed() {
        for provider in PROVIDERS {
            let value = ProviderSnapshot {
                provider: provider.id.into(),
                display_name: provider.display_name.into(),
                plan: Some("Pro".into()),
                short_window: None,
                weekly_window: None,
                monthly_window: None,
                reset_credits: None,
                reset_credit_expires_at: Vec::new(),
                balance_remaining: None,
                balance_unit: None,
                updated_at: chrono::Utc::now().to_rfc3339(),
                status: "ok".into(),
                message: None,
            };
            let snapshot = provider.conform(value);
            assert_eq!(snapshot.status, "unavailable");
            assert!(snapshot.plan.is_none());
            assert!(snapshot
                .message
                .is_some_and(|message| message.contains("no measurable quota")));
        }
    }
}
