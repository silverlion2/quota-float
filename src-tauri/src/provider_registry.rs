use crate::{
    antigravity, claude, codex, models::ProviderSnapshot, qoder, trae, volcengine, workbuddy,
};
use futures_util::future::join_all;
use reqwest::Client;
use std::time::Duration;

const RETRYABLE_STATUSES: [&str; 3] = ["unavailable", "stale", "loading"];

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
            Ok(values) => values,
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
}
