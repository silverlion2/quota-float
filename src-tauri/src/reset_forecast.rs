use chrono::{DateTime, SecondsFormat, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::time::Duration;

const RESET_RADAR_API_URL: &str = "https://codexresetradar.com/api/status";
const RESET_RADAR_SOURCE_URL: &str = "https://codexresetradar.com/";
const CODEX_RESET_API_URL: &str = "https://codex-reset.com/api/forecast";
const CODEX_RESET_SOURCE_URL: &str = "https://codex-reset.com/";
const RESET_SIGNAL_API_URL: &str = "https://codexreset.app/api/signal";
const RESET_SIGNAL_SOURCE_URL: &str = "https://codexreset.app/";
const MAX_SOURCE_AGE_HOURS: i64 = 6;
const MAX_FUTURE_SKEW_MINUTES: i64 = 10;
const MAX_RESPONSE_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ForecastConfidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecastSource {
    pub name: String,
    pub score: u8,
    pub fetched_at: String,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecast {
    pub score: u8,
    pub window_hours: u8,
    pub fetched_at: String,
    pub reset_announced: bool,
    pub reset_at: Option<String>,
    pub expected_at: Option<String>,
    pub source_url: String,
    pub source_count: u8,
    pub confidence: ForecastConfidence,
    pub sources: Vec<ResetForecastSource>,
}

#[derive(Debug)]
struct SourceForecast {
    name: &'static str,
    score: u8,
    fetched_at: DateTime<Utc>,
    reset_announced: bool,
    expected_at: Option<DateTime<Utc>>,
    source_url: &'static str,
    reliability: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetRadarResponse {
    generated_at: String,
    forecast: ResetRadarPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetRadarPayload {
    probability: i16,
    window_hours: u8,
}

#[derive(Deserialize)]
struct CodexResetResponse {
    mode: String,
    updated_at: String,
    probabilities: CodexResetProbabilities,
    #[serde(default)]
    official_signal: Option<CodexResetOfficialSignal>,
}

#[derive(Deserialize)]
struct CodexResetProbabilities {
    rounded_48h: i16,
    #[serde(default)]
    commitment: Option<f64>,
    #[serde(default)]
    commitment_floor_percent: Option<i16>,
}

#[derive(Deserialize)]
struct CodexResetOfficialSignal {
    #[serde(default)]
    window: Option<CodexResetWindow>,
}

#[derive(Deserialize)]
struct CodexResetWindow {
    start_at: String,
    end_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetSignalResponse {
    data_as_of: String,
    forecast: ResetSignalPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetSignalPayload {
    probability_48h: i16,
}

fn timestamp(value: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let parsed = DateTime::parse_from_rfc3339(value)
        .ok()?
        .with_timezone(&Utc);
    let age = now.signed_duration_since(parsed);
    if age > chrono::Duration::hours(MAX_SOURCE_AGE_HOURS)
        || age < -chrono::Duration::minutes(MAX_FUTURE_SKEW_MINUTES)
    {
        return None;
    }
    Some(parsed)
}

fn raw_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn score(value: i16) -> u8 {
    value.clamp(0, 100) as u8
}

fn normalize_reset_radar(
    response: ResetRadarResponse,
    now: DateTime<Utc>,
) -> Option<SourceForecast> {
    if response.forecast.window_hours != 48 {
        return None;
    }
    Some(SourceForecast {
        name: "Codex Reset Radar",
        score: score(response.forecast.probability),
        fetched_at: timestamp(&response.generated_at, now)?,
        reset_announced: false,
        expected_at: None,
        source_url: RESET_RADAR_SOURCE_URL,
        reliability: 2,
    })
}

fn normalize_codex_reset(
    response: CodexResetResponse,
    now: DateTime<Utc>,
) -> Option<SourceForecast> {
    let fetched_at = timestamp(&response.updated_at, now)?;
    let commitment = response.probabilities.commitment.unwrap_or_default();
    let reset_announced =
        response.mode == "announced" && commitment >= 0.75 && response.official_signal.is_some();
    let expected_at = response
        .official_signal
        .and_then(|signal| signal.window)
        .and_then(|window| {
            let start = raw_timestamp(&window.start_at)?;
            let end = raw_timestamp(&window.end_at)?;
            if end < start || end < now - chrono::Duration::minutes(2) {
                return None;
            }
            Some(start + chrono::Duration::milliseconds((end - start).num_milliseconds() / 2))
        });
    let reported_score = response
        .probabilities
        .commitment_floor_percent
        .filter(|_| reset_announced)
        .unwrap_or(response.probabilities.rounded_48h);
    Some(SourceForecast {
        name: "Codex Reset",
        score: score(reported_score),
        fetched_at,
        reset_announced,
        expected_at,
        source_url: CODEX_RESET_SOURCE_URL,
        reliability: 3,
    })
}

fn normalize_reset_signal(
    response: ResetSignalResponse,
    now: DateTime<Utc>,
) -> Option<SourceForecast> {
    Some(SourceForecast {
        name: "Will Codex Reset Today",
        score: score(response.forecast.probability_48h),
        fetched_at: timestamp(&response.data_as_of, now)?,
        reset_announced: false,
        expected_at: None,
        source_url: RESET_SIGNAL_SOURCE_URL,
        reliability: 1,
    })
}

fn aggregate(mut sources: Vec<SourceForecast>) -> Option<ResetForecast> {
    if sources.is_empty() {
        return None;
    }
    sources.sort_by_key(|source| source.score);
    let scores = sources
        .iter()
        .map(|source| source.score)
        .collect::<Vec<_>>();
    let score = if scores.len() % 2 == 1 {
        scores[scores.len() / 2]
    } else {
        let right = scores.len() / 2;
        (u16::from(scores[right - 1]) + u16::from(scores[right])).div_ceil(2) as u8
    };
    let spread =
        scores.last().copied().unwrap_or_default() - scores.first().copied().unwrap_or_default();
    let announced = sources
        .iter()
        .filter(|source| source.reset_announced)
        .max_by_key(|source| source.reliability);
    let confidence = if announced.is_some() || (sources.len() >= 3 && spread <= 20) {
        ForecastConfidence::High
    } else if sources.len() >= 2 && spread <= 35 {
        ForecastConfidence::Medium
    } else {
        ForecastConfidence::Low
    };
    let primary = announced.unwrap_or_else(|| {
        sources
            .iter()
            .max_by_key(|source| source.reliability)
            .expect("non-empty forecast sources")
    });
    let fetched_at = sources
        .iter()
        .map(|source| source.fetched_at)
        .max()
        .expect("non-empty forecast sources");
    let reset_announced = announced.is_some();
    let expected_at = announced.and_then(|source| source.expected_at);
    let source_url = primary.source_url.to_string();
    let source_count = sources.len().min(u8::MAX as usize) as u8;
    let source_summaries = sources
        .into_iter()
        .map(|source| ResetForecastSource {
            name: source.name.into(),
            score: source.score,
            fetched_at: source
                .fetched_at
                .to_rfc3339_opts(SecondsFormat::Millis, true),
            source_url: source.source_url.into(),
        })
        .collect();

    Some(ResetForecast {
        score,
        window_hours: 48,
        fetched_at: fetched_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        reset_announced,
        reset_at: None,
        expected_at: expected_at.map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
        source_url,
        source_count,
        confidence,
        sources: source_summaries,
    })
}

async fn fetch_json<T: DeserializeOwned>(client: &reqwest::Client, url: &str) -> Option<T> {
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    if response.content_length().unwrap_or_default() > MAX_RESPONSE_BYTES as u64 {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice::<T>(&body).ok()
}

pub async fn fetch(client: &reqwest::Client) -> Option<ResetForecast> {
    let now = Utc::now();
    let requests = async {
        tokio::join!(
            fetch_json::<ResetRadarResponse>(client, RESET_RADAR_API_URL),
            fetch_json::<CodexResetResponse>(client, CODEX_RESET_API_URL),
            fetch_json::<ResetSignalResponse>(client, RESET_SIGNAL_API_URL),
        )
    };
    let (reset_radar, codex_reset, reset_signal) =
        tokio::time::timeout(Duration::from_secs(5), requests)
            .await
            .ok()?;
    let sources = [
        reset_radar.and_then(|value| normalize_reset_radar(value, now)),
        codex_reset.and_then(|value| normalize_codex_reset(value, now)),
        reset_signal.and_then(|value| normalize_reset_signal(value, now)),
    ]
    .into_iter()
    .flatten()
    .collect();
    aggregate(sources)
}

#[cfg(test)]
mod tests {
    use super::{
        aggregate, normalize_codex_reset, normalize_reset_radar, normalize_reset_signal,
        CodexResetResponse, ForecastConfidence, ResetRadarResponse, ResetSignalResponse,
    };
    use chrono::{TimeZone, Utc};

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 23, 10, 30, 0)
            .single()
            .expect("valid test time")
    }

    #[test]
    fn builds_a_fresh_median_consensus() {
        let radar: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:15:21.295Z","forecast":{"probability":39,"windowHours":48}}"#,
        )
        .expect("Reset Radar response should parse");
        let codex_reset: CodexResetResponse = serde_json::from_str(
            r#"{"mode":"model","updated_at":"2026-08-23T10:24:05.046Z","probabilities":{"rounded_48h":50,"commitment":null,"commitment_floor_percent":null},"official_signal":null}"#,
        )
        .expect("Codex Reset response should parse");
        let reset_signal: ResetSignalResponse = serde_json::from_str(
            r#"{"dataAsOf":"2026-08-23T10:11:40.277Z","forecast":{"probability48h":83}}"#,
        )
        .expect("reset signal response should parse");

        let forecast = aggregate(vec![
            normalize_reset_radar(radar, now()).expect("fresh Radar source"),
            normalize_codex_reset(codex_reset, now()).expect("fresh Codex Reset source"),
            normalize_reset_signal(reset_signal, now()).expect("fresh reset signal source"),
        ])
        .expect("forecast consensus");

        assert_eq!(forecast.score, 50);
        assert_eq!(forecast.source_count, 3);
        assert_eq!(forecast.confidence, ForecastConfidence::Low);
        assert_eq!(forecast.source_url, "https://codex-reset.com/");
        assert!(!forecast.reset_announced);
        assert_eq!(forecast.sources.len(), 3);
    }

    #[test]
    fn explicit_timed_announcement_overrides_model_disagreement() {
        let response: CodexResetResponse = serde_json::from_str(
            r#"{"mode":"announced","updated_at":"2026-08-23T10:24:05.046Z","probabilities":{"rounded_48h":50,"commitment":0.85,"commitment_floor_percent":80},"official_signal":{"window":{"start_at":"2026-08-23T20:00:00Z","end_at":"2026-08-23T22:00:00Z"}}}"#,
        )
        .expect("announced response should parse");
        let forecast = aggregate(vec![
            normalize_codex_reset(response, now()).expect("fresh announcement source")
        ])
        .expect("announced forecast");

        assert!(forecast.reset_announced);
        assert_eq!(forecast.score, 80);
        assert_eq!(forecast.confidence, ForecastConfidence::High);
        assert_eq!(
            forecast.expected_at.as_deref(),
            Some("2026-08-23T21:00:00.000Z")
        );
    }

    #[test]
    fn rejects_stale_source_data() {
        let response: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T03:00:00Z","forecast":{"probability":85,"windowHours":48}}"#,
        )
        .expect("Reset Radar response should parse");

        assert!(normalize_reset_radar(response, now()).is_none());
    }

    #[test]
    fn rejects_an_unexpected_forecast_window() {
        let response: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:15:21.295Z","forecast":{"probability":85,"windowHours":24}}"#,
        )
        .expect("Reset Radar response should parse");

        assert!(normalize_reset_radar(response, now()).is_none());
    }
}
