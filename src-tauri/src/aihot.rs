//! On-demand public events. This module never reads provider credentials or account data.
use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, CACHE_CONTROL, ETAG, IF_NONE_MATCH, RETRY_AFTER};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const MIN_INTERVAL: Duration = Duration::from_secs(600);
const MAX_BYTES: usize = 256 * 1024;
const MAX_EVENTS: usize = 100;
const PROVIDERS: [&str; 4] = ["codex", "claude", "antigravity", "grok-bot"];
const SOURCES: [&str; 4] = [
    "https://aihot.news/codex-reset",
    "https://aihot.news/claude-reset",
    "https://aihot.news/antigravity-reset",
    "https://aihot.news/grok-bot-reset",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceStatus {
    Healthy,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventStatus {
    Announced,
    InProgress,
    Confirmed,
    ExpiredUnconfirmed,
    LikelyCompleted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHotEvent {
    pub id: String,
    pub title: String,
    pub status: EventStatus,
    pub scope: Option<String>,
    /// Source confirmation post time, never the time a user's quota changed.
    pub reported_at: Option<String>,
    /// Source event record update time, independent of verification and confirmation.
    pub updated_at: Option<String>,
    pub url: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHotSource {
    pub provider: &'static str,
    pub status: SourceStatus,
    pub checked_at: Option<String>,
    pub updated_at: Option<String>,
    pub source_url: &'static str,
    pub events: Vec<AiHotEvent>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHotReport {
    pub checked_at: String,
    pub sources: Vec<AiHotSource>,
}

#[derive(Default)]
struct CacheEntry {
    source: Option<AiHotSource>,
    etag: Option<String>,
    next_request: Option<Instant>,
    has_snapshot: bool,
    snapshot_healthy: bool,
}

#[derive(Default)]
pub struct AiHotState {
    // Also coalesces simultaneous button presses across callers.
    entries: tokio::sync::Mutex<[CacheEntry; 4]>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    schema_version: u32,
    timezone: String,
    checked_at: Option<String>,
    events: Vec<Event>,
    monitor: Option<Monitor>,
}

#[derive(Deserialize)]
struct Monitor {
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    id: String,
    display_label: Option<String>,
    status: EventStatus,
    confirmed_at: Option<String>,
    updated_at: Option<String>,
    presentation: Option<Presentation>,
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Presentation {
    status: EventStatus,
    scope_label: Option<String>,
}

fn text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
        .take(limit)
        .collect::<String>()
        .trim()
        .to_owned()
}

fn timestamp(value: Option<&str>, now: DateTime<Utc>) -> Option<String> {
    let parsed = DateTime::parse_from_rfc3339(value?).ok()?;
    (parsed <= now + chrono::Duration::minutes(5)).then(|| parsed.to_rfc3339())
}

fn source_fresh(updated: Option<&str>, now: DateTime<Utc>) -> bool {
    updated
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|value| {
            value <= now + chrono::Duration::minutes(5) && value >= now - chrono::Duration::hours(6)
        })
}

fn normalize(bytes: &[u8], index: usize, now: DateTime<Utc>) -> Result<AiHotSource, &'static str> {
    if bytes.len() > MAX_BYTES {
        return Err("AIHOT response exceeded the size limit.");
    }
    let response: Response =
        serde_json::from_slice(bytes).map_err(|_| "AIHOT returned an unsupported response.")?;
    if response.schema_version != 1
        || response.timezone != "Asia/Shanghai"
        || response.events.len() > MAX_EVENTS
    {
        return Err("AIHOT returned an unsupported response.");
    }
    let mut events = Vec::new();
    for event in response.events {
        // Exact public page allowlist; never forward remote arbitrary URLs to native openers.
        if event.url != SOURCES[index]
            || event.id.is_empty()
            || event.id.len() > 128
            || event.id.chars().any(char::is_control)
        {
            return Err("AIHOT returned invalid event metadata.");
        }
        if !matches!(
            event.status,
            EventStatus::Announced | EventStatus::Confirmed
        ) {
            return Err("AIHOT returned an unsupported event status.");
        }
        let mut status = event
            .presentation
            .as_ref()
            .map_or_else(|| event.status.clone(), |value| value.status.clone());
        // An inference cannot promote an announcement to a confirmed public event.
        if event.status != EventStatus::Confirmed && status == EventStatus::Confirmed {
            status = EventStatus::Announced;
        }
        let title = event
            .display_label
            .as_deref()
            .map(|value| text(value, 160))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Public reset event".to_owned());
        let scope = event
            .presentation
            .and_then(|value| value.scope_label)
            .map(|value| text(&value, 240))
            .filter(|value| !value.is_empty());
        let reported_at = (status == EventStatus::Confirmed)
            .then(|| timestamp(event.confirmed_at.as_deref(), now))
            .flatten();
        let updated_at = timestamp(event.updated_at.as_deref(), now);
        events.push(AiHotEvent {
            id: text(&event.id, 128),
            title,
            status,
            scope,
            reported_at,
            updated_at,
            url: SOURCES[index],
        });
    }
    let updated_at = timestamp(response.checked_at.as_deref(), now);
    let healthy = source_fresh(updated_at.as_deref(), now)
        && response
            .monitor
            .is_some_and(|monitor| monitor.status == "healthy");
    Ok(AiHotSource {
        provider: PROVIDERS[index],
        status: if healthy {
            SourceStatus::Healthy
        } else {
            SourceStatus::Stale
        },
        checked_at: Some(now.to_rfc3339()),
        updated_at,
        source_url: SOURCES[index],
        events,
        error: (!healthy).then(|| "AIHOT verification is delayed or unavailable.".to_owned()),
    })
}

pub(crate) fn request_interval(headers: &HeaderMap, now: DateTime<Utc>) -> Duration {
    let cache_seconds = headers
        .get(CACHE_CONTROL)
        .and_then(|value| value.to_str().ok())
        .into_iter()
        .flat_map(|value| value.split(','))
        .filter_map(|directive| {
            let (key, value) = directive.trim().split_once('=')?;
            matches!(key.trim(), "max-age" | "s-maxage")
                .then(|| value.trim_matches('"').parse::<u64>().ok())
                .flatten()
        })
        .max()
        .unwrap_or(0);
    let retry_seconds = headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.parse::<u64>().ok().or_else(|| {
                DateTime::parse_from_rfc2822(value)
                    .ok()
                    .map(|date| date.signed_duration_since(now).num_seconds().max(0) as u64)
            })
        })
        .unwrap_or(0);
    Duration::from_secs(cache_seconds.max(retry_seconds).max(MIN_INTERVAL.as_secs()))
}

fn mark_failure(entry: &mut CacheEntry, index: usize, now: DateTime<Utc>, message: &str) {
    let source = entry.source.get_or_insert_with(|| AiHotSource {
        provider: PROVIDERS[index],
        status: SourceStatus::Unavailable,
        checked_at: None,
        updated_at: None,
        source_url: SOURCES[index],
        events: vec![],
        error: None,
    });
    source.status = if entry.has_snapshot {
        SourceStatus::Stale
    } else {
        SourceStatus::Unavailable
    };
    source.checked_at = Some(now.to_rfc3339());
    source.error = Some(message.to_owned());
}

fn revalidate_age(entry: &mut CacheEntry, now: DateTime<Utc>) {
    if let Some(source) = &mut entry.source {
        if source.status == SourceStatus::Healthy
            && !source_fresh(source.updated_at.as_deref(), now)
        {
            source.status = SourceStatus::Stale;
            source.error = Some("AIHOT verification is delayed or unavailable.".to_owned());
        }
    }
}

fn not_modified(entry: &mut CacheEntry, now: DateTime<Utc>) -> Result<(), &'static str> {
    if !entry.has_snapshot {
        return Err("AIHOT returned an invalid cache response.");
    }
    if let Some(source) = &mut entry.source {
        source.checked_at = Some(now.to_rfc3339());
        let healthy = entry.snapshot_healthy && source_fresh(source.updated_at.as_deref(), now);
        source.status = if healthy {
            SourceStatus::Healthy
        } else {
            SourceStatus::Stale
        };
        source.error =
            (!healthy).then(|| "AIHOT verification is delayed or unavailable.".to_owned());
    }
    Ok(())
}

async fn refresh(entry: &mut CacheEntry, index: usize, client: &reqwest::Client) {
    let now = Utc::now();
    revalidate_age(entry, now);
    if entry
        .next_request
        .is_some_and(|deadline| Instant::now() < deadline)
    {
        return;
    }
    entry.next_request = Some(Instant::now() + MIN_INTERVAL);
    let mut request = client.get(format!(
        "https://aihot.news/api/v1/{}-resets/recent",
        PROVIDERS[index]
    ));
    if let Some(etag) = &entry.etag {
        request = request.header(IF_NONE_MATCH, etag);
    }
    let result = async {
        let mut response = request
            .send()
            .await
            .map_err(|_| "AIHOT is temporarily unavailable.")?;
        let interval = request_interval(response.headers(), now);
        // An unrepresentable deadline remains effectively blocked for this process lifetime.
        entry.next_request = Instant::now()
            .checked_add(interval)
            .or_else(|| Instant::now().checked_add(Duration::from_secs(100 * 365 * 24 * 3600)));
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            return not_modified(entry, now);
        }
        if !response.status().is_success() {
            return Err("AIHOT is temporarily unavailable.");
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BYTES as u64)
        {
            return Err("AIHOT response exceeded the size limit.");
        }
        let etag = response
            .headers()
            .get(ETAG)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.len() <= 512)
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "AIHOT response could not be read.")?
        {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err("AIHOT response exceeded the size limit.");
            }
            bytes.extend_from_slice(&chunk);
        }
        let source = normalize(&bytes, index, now)?;
        entry.snapshot_healthy = source.status == SourceStatus::Healthy;
        entry.source = Some(source);
        entry.etag = etag;
        entry.has_snapshot = true;
        Ok(())
    }
    .await;
    if let Err(message) = result {
        mark_failure(entry, index, now, message);
    }
}

pub async fn fetch(state: &AiHotState) -> Result<AiHotReport, String> {
    // Dedicated anonymous client: no provider headers, cookies, credentials, actor ID or redirects.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("aihot-api/2.0.0 QuotaFloat")
        .build()
        .map_err(|_| "AIHOT client is unavailable.".to_owned())?;
    let mut entries = state.entries.lock().await;
    let [codex, claude, antigravity, grok] = &mut *entries;
    tokio::join!(
        refresh(codex, 0, &client),
        refresh(claude, 1, &client),
        refresh(antigravity, 2, &client),
        refresh(grok, 3, &client)
    );
    Ok(AiHotReport {
        checked_at: Utc::now().to_rfc3339(),
        sources: entries
            .iter()
            .filter_map(|entry| entry.source.clone())
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    #[ignore = "Opt-in anonymous read-only check of AIHOT transport and all four public schemas"]
    async fn live_aihot_public_sources() {
        let report = fetch(&AiHotState::default()).await.unwrap();
        assert_eq!(report.sources.len(), PROVIDERS.len());
        for source in &report.sources {
            println!(
                "provider={} status={:?} events={} verified={}",
                source.provider,
                source.status,
                source.events.len(),
                source.updated_at.as_deref().unwrap_or("unknown")
            );
        }
        assert!(
            report
                .sources
                .iter()
                .all(|source| source.status != SourceStatus::Unavailable),
            "One or more public AIHOT sources were unavailable or could not be validated."
        );
    }

    fn now() -> DateTime<Utc> {
        "2026-11-16T12:00:00Z".parse().unwrap()
    }

    fn fixture() -> serde_json::Value {
        json!({"schemaVersion":1,"timezone":"Asia/Shanghai","checkedAt":"2026-11-16T11:59:00Z",
            "monitor":{"status":"healthy"},"events":[{"id":"synthetic-event","displayLabel":"Reset credit",
            "label":"all accounts","title":"DO NOT USE THIS UNQUALIFIED TITLE","status":"announced",
            "confirmedAt":null,"updatedAt":"2026-11-16T10:00:00Z","url":SOURCES[0],"presentation":{"status":"likely_completed","scopeLabel":null}}]})
    }

    #[test]
    fn inference_never_becomes_confirmation_or_account_arrival() {
        let source = normalize(&serde_json::to_vec(&fixture()).unwrap(), 0, now()).unwrap();
        assert_eq!(source.status, SourceStatus::Healthy);
        assert_eq!(source.events[0].status, EventStatus::LikelyCompleted);
        assert_eq!(source.events[0].title, "Reset credit");
        assert!(source.events[0].reported_at.is_none());
        assert_eq!(
            source.events[0].updated_at.as_deref(),
            Some("2026-11-16T10:00:00+00:00")
        );
        assert!(source.events[0].scope.is_none());
        let mut value = fixture();
        value["events"][0]["presentation"]["status"] = json!("confirmed");
        value["events"][0]["confirmedAt"] = json!("2026-11-16T11:00:00Z");
        assert_eq!(
            normalize(&serde_json::to_vec(&value).unwrap(), 0, now())
                .unwrap()
                .events[0]
                .status,
            EventStatus::Announced
        );
    }

    #[test]
    fn rejects_schema_url_and_payload_corruption() {
        for url in [
            "https://aihot.news.evil.test/codex-reset",
            "javascript:alert(1)",
            "https://aihot.news/claude-reset",
        ] {
            let mut value = fixture();
            value["events"][0]["url"] = json!(url);
            assert!(normalize(&serde_json::to_vec(&value).unwrap(), 0, now()).is_err());
        }
        let mut value = fixture();
        value["schemaVersion"] = json!(2);
        assert!(normalize(&serde_json::to_vec(&value).unwrap(), 0, now()).is_err());
        assert!(normalize(&vec![b' '; MAX_BYTES + 1], 0, now()).is_err());
        assert!(normalize(b"<html>unavailable</html>", 0, now()).is_err());
    }

    #[test]
    fn old_or_unverified_source_is_stale_even_after_successful_fetch() {
        for checked in [
            json!(null),
            json!("2026-11-15T12:00:00Z"),
            json!("2027-01-01T00:00:00Z"),
        ] {
            let mut value = fixture();
            value["checkedAt"] = checked;
            assert_eq!(
                normalize(&serde_json::to_vec(&value).unwrap(), 0, now())
                    .unwrap()
                    .status,
                SourceStatus::Stale
            );
        }
    }

    #[test]
    fn invalid_event_update_time_stays_unknown() {
        for updated in [
            json!(null),
            json!("not-a-date"),
            json!("2027-02-30T12:00:00Z"),
            json!("2027-01-01T00:00:00Z"),
        ] {
            let mut value = fixture();
            value["events"][0]["updatedAt"] = updated;
            let source = normalize(&serde_json::to_vec(&value).unwrap(), 0, now()).unwrap();
            assert!(source.events[0].updated_at.is_none());
        }
    }

    #[test]
    fn failures_preserve_last_good_but_never_fabricate_success() {
        let mut entry = CacheEntry {
            source: Some(normalize(&serde_json::to_vec(&fixture()).unwrap(), 0, now()).unwrap()),
            has_snapshot: true,
            ..Default::default()
        };
        mark_failure(&mut entry, 0, now(), "Unavailable");
        let source = entry.source.as_ref().unwrap();
        assert_eq!(source.events.len(), 1);
        assert_eq!(source.status, SourceStatus::Stale);
        let mut empty = CacheEntry::default();
        mark_failure(&mut empty, 1, now(), "Unavailable");
        assert_eq!(empty.source.unwrap().status, SourceStatus::Unavailable);
    }

    #[test]
    fn server_backoff_and_cache_ttl_are_never_shortened() {
        let mut headers = HeaderMap::new();
        assert_eq!(request_interval(&headers, now()), MIN_INTERVAL);
        headers.insert(
            CACHE_CONTROL,
            "public, max-age=120, s-maxage=1800".parse().unwrap(),
        );
        assert_eq!(request_interval(&headers, now()).as_secs(), 1800);
        headers.insert(RETRY_AFTER, "3600".parse().unwrap());
        assert_eq!(request_interval(&headers, now()).as_secs(), 3600);
        headers.insert(
            RETRY_AFTER,
            "Mon, 16 Nov 2026 14:00:00 GMT".parse().unwrap(),
        );
        assert_eq!(request_interval(&headers, now()).as_secs(), 7200);
    }

    #[test]
    fn cached_snapshot_ages_without_network_requests() {
        let mut entry = CacheEntry {
            source: Some(normalize(&serde_json::to_vec(&fixture()).unwrap(), 0, now()).unwrap()),
            has_snapshot: true,
            ..Default::default()
        };
        revalidate_age(&mut entry, now() + chrono::Duration::hours(7));
        assert_eq!(entry.source.unwrap().status, SourceStatus::Stale);
    }

    #[test]
    fn conditional_success_recovers_failed_fetch_without_refreshing_watermark() {
        let mut entry = CacheEntry {
            source: Some(normalize(&serde_json::to_vec(&fixture()).unwrap(), 0, now()).unwrap()),
            has_snapshot: true,
            snapshot_healthy: true,
            ..Default::default()
        };
        let watermark = entry.source.as_ref().unwrap().updated_at.clone();
        mark_failure(&mut entry, 0, now(), "Unavailable");
        not_modified(&mut entry, now()).unwrap();
        assert_eq!(entry.source.as_ref().unwrap().status, SourceStatus::Healthy);
        assert_eq!(entry.source.as_ref().unwrap().updated_at, watermark);
        not_modified(&mut entry, now() + chrono::Duration::hours(7)).unwrap();
        assert_eq!(entry.source.unwrap().status, SourceStatus::Stale);
        assert!(not_modified(&mut CacheEntry::default(), now()).is_err());
    }
}
