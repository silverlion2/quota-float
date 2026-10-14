use chrono::{DateTime, SecondsFormat, Timelike, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::future::Future;
use std::time::Duration;

const RESET_RADAR_API_URL: &str = "https://codexresetradar.com/api/status";
const RESET_RADAR_SOURCE_URL: &str = "https://codexresetradar.com/";
const CODEX_RESET_API_URL: &str = "https://codex-reset.com/api/forecast";
const CODEX_RESET_SOURCE_URL: &str = "https://codex-reset.com/";
const RESET_SIGNAL_API_URL: &str = "https://codexreset.app/api/signal";
const RESET_SIGNAL_SOURCE_URL: &str = "https://codexreset.app/";
const MAX_SOURCE_AGE_HOURS: i64 = 6;
const MAX_FUTURE_SKEW_MINUTES: i64 = 5;
const MAX_RESPONSE_BYTES: usize = 128 * 1024;
const SOURCE_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SCORE_SPREAD: u8 = 25;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ForecastConfidence {
    Low,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ForecastQuality {
    Consistent,
    Limited,
    Conflicting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecastSource {
    pub name: String,
    pub score: u8,
    pub fetched_at: String,
    pub source_url: String,
    pub last_reset_at: Option<String>,
    pub included: bool,
    pub baseline_verified: bool,
    pub exclusion_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecastExclusion {
    pub name: String,
    pub source_url: String,
    pub last_reset_at: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionRange {
    pub lower: f64,
    pub upper: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionWindow {
    pub start_at: String,
    pub end_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetPrediction {
    pub source_name: String,
    pub source_url: String,
    pub basis: &'static str,
    pub reported_last_reset_at: Option<String>,
    pub generated_at: String,
    pub valid_until: String,
    pub estimate24h: Option<u8>,
    pub estimate48h: u8,
    pub range24h: Option<PredictionRange>,
    pub range48h: Option<PredictionRange>,
    pub calibration: &'static str,
    pub expected_window: Option<PredictionWindow>,
    pub watch_window: Option<PredictionWindow>,
    pub confidence: ForecastConfidence,
    pub reason: String,
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
    pub quality: ForecastQuality,
    pub score_min: Option<u8>,
    pub score_max: Option<u8>,
    pub quality_reason: Option<String>,
    pub latest_reset_at: Option<String>,
    pub exclusions: Vec<ResetForecastExclusion>,
    pub prediction: Option<ResetPrediction>,
}

#[derive(Debug, Default)]
struct PredictionData {
    score24h: Option<u8>,
    range24h: Option<PredictionRange>,
    range48h: Option<PredictionRange>,
    expected_window: Option<(DateTime<Utc>, DateTime<Utc>)>,
    watch_window: Option<(DateTime<Utc>, DateTime<Utc>)>,
    is_model: bool,
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
    last_reset_at: Option<DateTime<Utc>>,
    prediction: PredictionData,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetRadarResponse {
    generated_at: String,
    forecast: ResetRadarPayload,
    #[serde(default)]
    latest_reset: Option<ResetRadarLatestReset>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetRadarLatestReset {
    occurred_at: String,
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
    #[serde(default)]
    last_reset_at: Option<String>,
    #[serde(default)]
    time_window: Option<CodexResetTimeWindow>,
}

#[derive(Deserialize)]
struct CodexResetProbabilities {
    rounded_48h: i16,
    #[serde(default)]
    rounded_24h: Option<i16>,
    #[serde(default)]
    range_24h: Option<CodexResetRange>,
    #[serde(default)]
    range_48h: Option<CodexResetRange>,
    #[serde(default)]
    commitment: Option<f64>,
    #[serde(default)]
    commitment_floor_percent: Option<i16>,
}

#[derive(Deserialize)]
struct CodexResetRange {
    lower: f64,
    upper: f64,
}

#[derive(Deserialize)]
struct CodexResetTimeWindow {
    start_hour: u8,
    end_hour: u8,
    timezone: String,
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
    #[serde(default)]
    last_confirmed_reset: Option<ResetSignalLastReset>,
}

#[derive(Deserialize)]
struct ResetSignalLastReset {
    #[serde(default)]
    timestamp: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetSignalPayload {
    probability_48h: i16,
    #[serde(default)]
    probability_24h: Option<i16>,
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

fn baseline_timestamp(value: Option<&str>, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let parsed = raw_timestamp(value?)?;
    (parsed <= now + chrono::Duration::minutes(MAX_FUTURE_SKEW_MINUTES)).then_some(parsed)
}

fn score(value: i16) -> Option<u8> {
    (0..=100).contains(&value).then_some(value as u8)
}

fn prediction_range(value: Option<CodexResetRange>, estimate: u8) -> Option<PredictionRange> {
    let value = value?;
    if !value.lower.is_finite()
        || !value.upper.is_finite()
        || !(0.0..=1.0).contains(&value.lower)
        || !(value.lower..=1.0).contains(&value.upper)
        // Whole-percent outputs can round half a point outside a narrow band.
        || f64::from(estimate) + 0.5 < value.lower * 100.0
        || f64::from(estimate) - 0.5 > value.upper * 100.0
    {
        return None;
    }
    Some(PredictionRange {
        lower: value.lower * 100.0,
        upper: value.upper * 100.0,
    })
}

fn daily_watch_window(
    value: Option<CodexResetTimeWindow>,
    generated_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    let value = value?;
    if value.timezone != "UTC"
        || value.start_hour >= 24
        || value.end_hour > 24
        || value.start_hour == value.end_hour
    {
        return None;
    }
    let midnight = generated_at
        .with_hour(0)?
        .with_minute(0)?
        .with_second(0)?
        .with_nanosecond(0)?;
    let mut start = midnight + chrono::Duration::hours(i64::from(value.start_hour));
    let mut end = midnight + chrono::Duration::hours(i64::from(value.end_hour));
    if end <= start {
        end += chrono::Duration::days(1);
        if generated_at < midnight + chrono::Duration::hours(i64::from(value.end_hour)) {
            start -= chrono::Duration::days(1);
            end -= chrono::Duration::days(1);
        }
    }
    if end <= generated_at {
        start += chrono::Duration::days(1);
        end += chrono::Duration::days(1);
    }
    // This is a historical time-of-day watch period, anchored to the source
    // calculation. Re-reading cached evidence never moves it to another day.
    (end > now && end <= generated_at + chrono::Duration::hours(48)).then_some((start, end))
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
        score: score(response.forecast.probability)?,
        fetched_at: timestamp(&response.generated_at, now)?,
        reset_announced: false,
        expected_at: None,
        source_url: RESET_RADAR_SOURCE_URL,
        reliability: 2,
        last_reset_at: response
            .latest_reset
            .and_then(|reset| baseline_timestamp(Some(&reset.occurred_at), now)),
        prediction: PredictionData::default(),
    })
}

fn normalize_codex_reset(
    response: CodexResetResponse,
    now: DateTime<Utc>,
) -> Option<SourceForecast> {
    let fetched_at = timestamp(&response.updated_at, now)?;
    let commitment = response
        .probabilities
        .commitment
        .filter(|value| value.is_finite() && (0.0..=1.0).contains(value));
    let score48h = score(response.probabilities.rounded_48h)?;
    let score24h = response
        .probabilities
        .rounded_24h
        .and_then(score)
        .filter(|value| *value <= score48h);
    let expected_window = response
        .official_signal
        .and_then(|signal| signal.window)
        .and_then(|window| {
            let start = raw_timestamp(&window.start_at)?;
            let end = raw_timestamp(&window.end_at)?;
            if end <= start || end <= now || end > fetched_at + chrono::Duration::days(14) {
                return None;
            }
            Some((start, end))
        });
    // A third-party tracker's mode and commitment are not an official
    // provider announcement. Keep the fields parsed for schema validation,
    // but never turn them into an actionable personal reset signal.
    let _tracker_claims_announcement = response.mode == "announced"
        && commitment.is_some_and(|value| value >= 0.75)
        && expected_window.is_some();
    let reset_announced = false;
    let reported_score = response
        .probabilities
        .commitment_floor_percent
        .filter(|_| reset_announced)
        .unwrap_or(response.probabilities.rounded_48h);
    Some(SourceForecast {
        name: "Codex Reset",
        score: score(reported_score)?,
        fetched_at,
        reset_announced,
        expected_at: None,
        source_url: CODEX_RESET_SOURCE_URL,
        reliability: 3,
        last_reset_at: baseline_timestamp(response.last_reset_at.as_deref(), now),
        prediction: PredictionData {
            score24h,
            range24h: score24h
                .and_then(|estimate| prediction_range(response.probabilities.range_24h, estimate)),
            range48h: prediction_range(response.probabilities.range_48h, score48h),
            expected_window,
            watch_window: daily_watch_window(response.time_window, fetched_at, now),
            is_model: response.mode == "model",
        },
    })
}

fn normalize_reset_signal(
    response: ResetSignalResponse,
    now: DateTime<Utc>,
) -> Option<SourceForecast> {
    let score48h = score(response.forecast.probability_48h)?;
    Some(SourceForecast {
        name: "Will Codex Reset Today",
        score: score48h,
        fetched_at: timestamp(&response.data_as_of, now)?,
        reset_announced: false,
        expected_at: None,
        source_url: RESET_SIGNAL_SOURCE_URL,
        reliability: 1,
        last_reset_at: response
            .last_confirmed_reset
            .and_then(|reset| baseline_timestamp(reset.timestamp.as_deref(), now)),
        prediction: PredictionData {
            score24h: response
                .forecast
                .probability_24h
                .and_then(score)
                .filter(|value| *value <= score48h),
            ..PredictionData::default()
        },
    })
}

fn aggregate(mut sources: Vec<SourceForecast>) -> Option<ResetForecast> {
    let mut deduplicated = Vec::with_capacity(sources.len());
    for source in sources.drain(..) {
        if let Some(existing) = deduplicated
            .iter_mut()
            .find(|existing: &&mut SourceForecast| existing.source_url == source.source_url)
        {
            if source.fetched_at > existing.fetched_at {
                *existing = source;
            }
        } else {
            deduplicated.push(source);
        }
    }
    sources = deduplicated;
    if sources.is_empty() {
        return None;
    }
    let latest_reset_at = sources
        .iter()
        .filter_map(|source| source.last_reset_at)
        .max();
    let corroborating_latest = latest_reset_at.map(|latest| {
        sources
            .iter()
            .filter(|source| {
                source.last_reset_at.is_some_and(|reset| {
                    reset <= latest && latest - reset <= chrono::Duration::hours(24)
                })
            })
            .count()
    });
    let latest_is_corroborated = corroborating_latest.is_some_and(|count| count >= 2);
    let mut exclusions = Vec::new();
    let mut included_sources = Vec::with_capacity(sources.len());
    for source in sources.iter() {
        let stale_against_latest = latest_reset_at.is_some_and(|latest| {
            source
                .last_reset_at
                .is_some_and(|reset| reset < latest && latest - reset > chrono::Duration::hours(24))
        });
        // A model anchored to a superseded reported reset is a poor reference
        // even when only one tracker has caught up. This selects a reference;
        // it does not turn the newer third-party claim into an official fact.
        let included = !stale_against_latest;
        if !included {
            exclusions.push(ResetForecastExclusion {
                name: source.name.to_string(),
                source_url: source.source_url.to_string(),
                last_reset_at: source
                    .last_reset_at
                    .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
                reason:
                    "reported reset baseline is more than 24 hours older than the newest reported baseline"
                        .to_string(),
            });
        }
        included_sources.push(included);
    }
    let eligible_scores = sources
        .iter()
        .zip(included_sources.iter())
        .filter(|(_, included)| **included)
        .map(|(source, _)| source.score)
        .collect::<Vec<_>>();
    let scores = if eligible_scores.is_empty() {
        sources
            .iter()
            .map(|source| source.score)
            .collect::<Vec<_>>()
    } else {
        eligible_scores
    };
    let score_min = scores.iter().min().copied();
    let score_max = scores.iter().max().copied();
    let large_score_disagreement = score_min
        .zip(score_max)
        .is_some_and(|(minimum, maximum)| maximum - minimum > MAX_SCORE_SPREAD);
    let has_unknown_baseline = sources
        .iter()
        .zip(included_sources.iter())
        .any(|(source, included)| *included && source.last_reset_at.is_none());
    let baseline_count = sources
        .iter()
        .filter(|source| source.last_reset_at.is_some())
        .count();
    let quality = if (latest_reset_at.is_some() && !latest_is_corroborated && baseline_count >= 2)
        || (latest_is_corroborated && large_score_disagreement)
    {
        ForecastQuality::Conflicting
    } else if latest_is_corroborated && !has_unknown_baseline {
        ForecastQuality::Consistent
    } else {
        ForecastQuality::Limited
    };
    let quality_reason = match quality {
        ForecastQuality::Consistent => None,
        ForecastQuality::Limited if !exclusions.is_empty() => Some(
            "Older reported reset baselines were excluded from the primary reference."
                .to_string(),
        ),
        ForecastQuality::Limited if has_unknown_baseline => Some(
            "Some sources do not report a reset baseline, so their freshness cannot be verified."
                .to_string(),
        ),
        ForecastQuality::Limited => Some(
            "Fewer than two sources corroborate the latest reported reset baseline."
                .to_string(),
        ),
        ForecastQuality::Conflicting if large_score_disagreement => Some(
            "Eligible source scores differ by more than 25 percentage points; the selected primary reference remains visible with low confidence."
                .to_string(),
        ),
        ForecastQuality::Conflicting => Some(
            "Sources disagree on reset baselines or scores; the selected primary reference remains visible with low confidence."
                .to_string(),
        ),
    };
    let announced = sources
        .iter()
        .filter(|source| source.reset_announced)
        .max_by_key(|source| source.reliability);
    // The trackers substantially reuse the same public posts and incidents.
    // Agreement between heuristic scores is not independent corroboration.
    let confidence = if announced.is_some() {
        ForecastConfidence::High
    } else {
        ForecastConfidence::Low
    };
    let primary = sources
        .iter()
        .zip(included_sources.iter())
        .filter(|(source, included)| {
            **included && (latest_reset_at.is_none() || source.last_reset_at.is_some())
        })
        .map(|(source, _)| source)
        .max_by_key(|source| {
            let information = u8::from(source.prediction.score24h.is_some())
                + u8::from(source.prediction.range48h.is_some())
                + u8::from(source.prediction.range24h.is_some())
                + u8::from(source.prediction.expected_window.is_some())
                + u8::from(source.prediction.watch_window.is_some());
            (information, source.reliability, source.fetched_at)
        })
        .expect("non-empty forecast sources");
    let fetched_at = primary.fetched_at;
    let score = primary.score;
    let serialize_window = |value: (DateTime<Utc>, DateTime<Utc>)| PredictionWindow {
        start_at: value.0.to_rfc3339_opts(SecondsFormat::Millis, true),
        end_at: value.1.to_rfc3339_opts(SecondsFormat::Millis, true),
    };
    let prediction = Some(ResetPrediction {
        source_name: primary.name.into(),
        source_url: primary.source_url.into(),
        basis: if primary.prediction.is_model { "source_model" } else { "source_signal" },
        reported_last_reset_at: primary.last_reset_at
            .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
        generated_at: fetched_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        valid_until: (fetched_at + chrono::Duration::hours(48))
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        estimate24h: primary.prediction.score24h,
        estimate48h: primary.score,
        range24h: primary.prediction.range24h.clone(),
        range48h: primary.prediction.range48h.clone(),
        calibration: if primary.prediction.is_model { "experimental" } else { "uncalibrated" },
        expected_window: primary.prediction.expected_window.map(serialize_window),
        watch_window: primary.prediction.watch_window.map(serialize_window),
        confidence: ForecastConfidence::Low,
        reason: if latest_reset_at.is_some() {
            "Primary reference uses the newest reported reset baseline, then information completeness, source reliability and calculation time. Other tracker disagreement is diagnostic; estimates are not averaged or independently calibrated."
        } else {
            "No source reports a reset baseline. The most complete available source is a fallback reference with unverified history; estimates are not averaged or independently calibrated."
        }.into(),
    });
    let reset_announced = announced.is_some();
    let expected_at = announced.and_then(|source| source.expected_at);
    let source_url = primary.source_url.to_string();
    let source_count = included_sources
        .iter()
        .filter(|included| **included)
        .count()
        .min(u8::MAX as usize) as u8;
    let source_summaries = sources
        .into_iter()
        .zip(included_sources)
        .map(|(source, included)| ResetForecastSource {
            name: source.name.into(),
            score: source.score,
            fetched_at: source
                .fetched_at
                .to_rfc3339_opts(SecondsFormat::Millis, true),
            source_url: source.source_url.into(),
            last_reset_at: source
                .last_reset_at
                .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
            included,
            baseline_verified: source.last_reset_at.is_some(),
            exclusion_reason: if included {
                None
            } else {
                Some(
                    "reported reset baseline is more than 24 hours older than the newest reported baseline"
                        .to_string(),
                )
            },
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
        quality,
        score_min,
        score_max,
        quality_reason,
        latest_reset_at: latest_reset_at
            .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
        exclusions,
        prediction,
    })
}

async fn fetch_json<T: DeserializeOwned>(client: &reqwest::Client, url: &str) -> Option<T> {
    let mut response = client
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            concat!(
                "QuotaFloat/",
                env!("CARGO_PKG_VERSION"),
                " (+https://github.com/silverlion2/quota-float)"
            ),
        )
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

async fn settle_source<T, F>(future: F, timeout: Duration) -> Option<T>
where
    F: Future<Output = Option<T>>,
{
    tokio::time::timeout(timeout, future).await.ok().flatten()
}

pub async fn fetch(client: &reqwest::Client) -> Option<ResetForecast> {
    let now = Utc::now();
    let (reset_radar, codex_reset, reset_signal) = tokio::join!(
        settle_source(
            fetch_json::<ResetRadarResponse>(client, RESET_RADAR_API_URL),
            SOURCE_TIMEOUT
        ),
        settle_source(
            fetch_json::<CodexResetResponse>(client, CODEX_RESET_API_URL),
            SOURCE_TIMEOUT
        ),
        settle_source(
            fetch_json::<ResetSignalResponse>(client, RESET_SIGNAL_API_URL),
            SOURCE_TIMEOUT
        ),
    );
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
        settle_source, CodexResetResponse, ForecastConfidence, ForecastQuality, ResetRadarResponse,
        ResetSignalResponse, SourceForecast,
    };
    use chrono::{DateTime, TimeZone, Utc};
    use std::time::Duration;

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 23, 10, 30, 0)
            .single()
            .expect("valid test time")
    }

    fn source(
        name: &'static str,
        score: u8,
        source_url: &'static str,
        last_reset_at: Option<&str>,
    ) -> SourceForecast {
        SourceForecast {
            name,
            score,
            fetched_at: now(),
            reset_announced: false,
            expected_at: None,
            source_url,
            reliability: 1,
            last_reset_at: last_reset_at.map(|value| {
                DateTime::parse_from_rfc3339(value)
                    .expect("valid source baseline")
                    .with_timezone(&Utc)
            }),
            prediction: super::PredictionData::default(),
        }
    }

    fn model(value: serde_json::Value, at: DateTime<Utc>) -> SourceForecast {
        let response = serde_json::from_value::<CodexResetResponse>(value).unwrap();
        normalize_codex_reset(response, at).unwrap()
    }

    fn model_payload() -> serde_json::Value {
        serde_json::json!({
            "mode": "model", "updated_at": "2026-08-23T10:20:00Z",
            "last_reset_at": "2026-08-22T08:00:00Z",
            "probabilities": {
                "rounded_24h": 19, "rounded_48h": 34,
                "range_24h": {"lower": 0.099, "upper": 0.325},
                "range_48h": {"lower": 0.218, "upper": 0.487}
            },
            "time_window": {"start_hour": 3, "end_hour": 6, "timezone": "UTC"}
        })
    }

    #[test]
    fn newest_reported_baseline_beats_old_high_scores_without_two_source_voting() {
        let reference = model(model_payload(), now());
        let stale_high = source(
            "old high",
            99,
            "https://old.example/",
            Some("2026-07-25T08:00:00Z"),
        );
        let forecast = aggregate(vec![reference, stale_high]).unwrap();
        assert_eq!(forecast.quality, ForecastQuality::Conflicting);
        assert_eq!(forecast.score, 34);
        assert_eq!(forecast.source_url, "https://codex-reset.com/");
        assert_eq!(forecast.fetched_at, "2026-08-23T10:20:00.000Z");
        assert!(!forecast.sources[1].included);
        assert!(forecast.exclusions[0].reason.contains("reported"));
        let prediction = forecast.prediction.unwrap();
        assert_eq!(prediction.estimate24h, Some(19));
        assert_eq!(prediction.estimate48h, 34);
        assert!((prediction.range48h.unwrap().upper - 48.7).abs() < 0.001);
        assert_eq!(prediction.calibration, "experimental");
        assert_eq!(prediction.basis, "source_model");
        assert_eq!(prediction.confidence, ForecastConfidence::Low);
        assert_eq!(prediction.valid_until, "2026-08-25T10:20:00.000Z");
        assert_eq!(
            prediction.watch_window.unwrap().start_at,
            "2026-08-24T03:00:00.000Z"
        );
        assert!(!forecast.reset_announced);
    }

    #[test]
    fn unknown_baseline_does_not_override_a_known_reference() {
        let known = source(
            "known",
            20,
            "https://known.example/",
            Some("2026-08-22T08:00:00Z"),
        );
        let mut unknown = model(model_payload(), now());
        unknown.last_reset_at = None;
        let prediction = aggregate(vec![known, unknown]).unwrap().prediction.unwrap();
        assert_eq!(prediction.source_name, "known");
        assert_eq!(prediction.estimate48h, 20);
    }

    #[test]
    fn missing_primary_falls_back_to_an_available_source_without_fake_ranges() {
        let unknown = source("fallback", 51, "https://fallback.example/", None);
        let forecast = aggregate(vec![unknown]).unwrap();
        let prediction = forecast.prediction.unwrap();
        assert_eq!(forecast.quality, ForecastQuality::Limited);
        assert_eq!(prediction.basis, "source_signal");
        assert_eq!(prediction.calibration, "uncalibrated");
        assert_eq!(prediction.estimate48h, 51);
        assert!(prediction.estimate24h.is_none());
        assert!(prediction.range48h.is_none());
        assert!(prediction.expected_window.is_none());
        assert!(prediction.watch_window.is_none());
        assert!(prediction.reason.contains("No source reports"));
        assert!(aggregate(vec![]).is_none());
    }

    #[test]
    fn same_baseline_disagreement_keeps_complete_primary_model_and_its_own_band() {
        let low = model(model_payload(), now());
        let high = source(
            "high",
            94,
            "https://high.example/",
            Some("2026-08-22T08:00:00Z"),
        );
        let forecast = aggregate(vec![low, high]).unwrap();
        assert_eq!(forecast.quality, ForecastQuality::Conflicting);
        assert_eq!(forecast.score, 34);
        let prediction = forecast.prediction.unwrap();
        assert_eq!(prediction.source_name, "Codex Reset");
        assert!(prediction.range48h.unwrap().upper < 50.0);
    }

    #[test]
    fn malformed_ranges_and_reversed_horizon_estimates_are_not_repaired_into_certainty() {
        for (lower, upper) in [(0.5, 0.2), (-0.1, 0.5), (0.2, 1.1), (0.8, 0.9)] {
            let mut payload = model_payload();
            payload["probabilities"]["range_48h"] =
                serde_json::json!({"lower": lower, "upper": upper});
            payload["probabilities"]["rounded_24h"] = serde_json::json!(90);
            let normalized = model(payload, now());
            assert!(normalized.prediction.range48h.is_none());
            assert!(normalized.prediction.score24h.is_none());
            assert!(normalized.prediction.range24h.is_none());
            assert_eq!(normalized.score, 34);
        }
        assert!(super::prediction_range(
            Some(super::CodexResetRange {
                lower: f64::NAN,
                upper: 0.5
            }),
            34
        )
        .is_none());
        assert!(super::prediction_range(
            Some(super::CodexResetRange {
                lower: 0.2,
                upper: f64::INFINITY
            }),
            34
        )
        .is_none());
    }

    #[test]
    fn expired_expected_windows_are_discarded_and_source_time_anchors_watch_day() {
        let mut payload = model_payload();
        payload["official_signal"] = serde_json::json!({"window": {"start_at": "2026-08-23T08:00:00Z", "end_at": "2026-08-23T09:00:00Z"}});
        let normalized = model(payload, now());
        assert!(normalized.prediction.expected_window.is_none());
        let value = || {
            Some(super::CodexResetTimeWindow {
                start_hour: 3,
                end_hour: 6,
                timezone: "UTC".into(),
            })
        };
        let generated = now();
        let later = generated + chrono::Duration::hours(21);
        assert!(super::daily_watch_window(value(), generated, later).is_none());
        let anchored = super::daily_watch_window(value(), generated, generated).unwrap();
        assert_eq!(anchored.0.to_rfc3339(), "2026-08-24T03:00:00+00:00");
    }

    #[test]
    fn utc_watch_window_handles_midnight_crossing_and_rejects_unknown_zones() {
        let generated = Utc.with_ymd_and_hms(2026, 8, 23, 1, 0, 0).single().unwrap();
        let value = Some(super::CodexResetTimeWindow {
            start_hour: 23,
            end_hour: 2,
            timezone: "UTC".into(),
        });
        let (start, end) = super::daily_watch_window(value, generated, generated).unwrap();
        assert_eq!(start.to_rfc3339(), "2026-08-22T23:00:00+00:00");
        assert_eq!(end.to_rfc3339(), "2026-08-23T02:00:00+00:00");
        for (start_hour, end_hour, timezone) in
            [(24, 2, "UTC"), (2, 25, "UTC"), (3, 3, "UTC"), (3, 6, "PST")]
        {
            assert!(super::daily_watch_window(
                Some(super::CodexResetTimeWindow {
                    start_hour,
                    end_hour,
                    timezone: timezone.into()
                }),
                generated,
                generated
            )
            .is_none());
        }
    }

    #[test]
    fn builds_a_primary_reference_without_averaging_independent_models() {
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
        assert_eq!(forecast.fetched_at, "2026-08-23T10:24:05.046Z");
        assert_eq!(forecast.source_url, "https://codex-reset.com/");
        assert!(!forecast.reset_announced);
        assert_eq!(forecast.sources.len(), 3);
    }

    #[test]
    fn captures_each_provider_baseline_timestamp_when_present() {
        let radar: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:15:21.295Z","latestReset":{"occurredAt":"2026-08-22T02:34:27.415Z"},"forecast":{"probability":39,"windowHours":48}}"#,
        )
        .expect("Radar response should parse");
        let codex_reset: CodexResetResponse = serde_json::from_str(
            r#"{"mode":"model","updated_at":"2026-08-23T10:24:05.046Z","last_reset_at":"2026-08-23T08:09:17.000Z","probabilities":{"rounded_48h":50}}"#,
        )
        .expect("Codex Reset response should parse");
        let reset_signal: ResetSignalResponse = serde_json::from_str(
            r#"{"dataAsOf":"2026-08-23T10:11:40.277Z","lastConfirmedReset":{"timestamp":"2026-08-21T19:17:12.000Z"},"forecast":{"probability48h":83}}"#,
        )
        .expect("reset signal response should parse");

        assert_eq!(
            normalize_reset_radar(radar, now())
                .expect("Radar source")
                .last_reset_at
                .expect("Radar baseline")
                .to_rfc3339(),
            "2026-08-22T02:34:27.415+00:00"
        );
        assert_eq!(
            normalize_codex_reset(codex_reset, now())
                .expect("Codex Reset source")
                .last_reset_at
                .expect("Codex Reset baseline")
                .to_rfc3339(),
            "2026-08-23T08:09:17+00:00"
        );
        assert_eq!(
            normalize_reset_signal(reset_signal, now())
                .expect("reset signal source")
                .last_reset_at
                .expect("reset signal baseline")
                .to_rfc3339(),
            "2026-08-21T19:17:12+00:00"
        );
    }

    #[test]
    fn third_party_timed_announcement_remains_non_actionable() {
        let response: CodexResetResponse = serde_json::from_str(
            r#"{"mode":"announced","updated_at":"2026-08-23T10:24:05.046Z","probabilities":{"rounded_48h":50,"commitment":0.85,"commitment_floor_percent":80},"official_signal":{"window":{"start_at":"2026-08-23T20:00:00Z","end_at":"2026-08-23T22:00:00Z"}}}"#,
        )
        .expect("announced response should parse");
        let forecast = aggregate(vec![
            normalize_codex_reset(response, now()).expect("fresh announcement source")
        ])
        .expect("announced forecast");

        assert!(!forecast.reset_announced);
        assert_eq!(forecast.score, 50);
        assert_eq!(forecast.confidence, ForecastConfidence::Low);
        assert_eq!(forecast.expected_at, None);
        let prediction = forecast.prediction.unwrap();
        assert_eq!(prediction.basis, "source_signal");
        assert_eq!(prediction.calibration, "uncalibrated");
        let window = prediction.expected_window.unwrap();
        assert_eq!(window.start_at, "2026-08-23T20:00:00.000Z");
        assert_eq!(window.end_at, "2026-08-23T22:00:00.000Z");
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
    fn parses_tracker_reset_baselines_and_rejects_future_metadata() {
        let radar = serde_json::from_str::<ResetRadarResponse>(
            r#"{"generatedAt":"2026-08-23T10:15:00Z","forecast":{"probability":45,"windowHours":48},"latestReset":{"occurredAt":"2026-08-20T08:00:00Z"}}"#,
        ).unwrap();
        let codex = serde_json::from_str::<CodexResetResponse>(
            r#"{"mode":"model","updated_at":"2026-08-23T10:15:00Z","probabilities":{"rounded_48h":42},"last_reset_at":"2026-08-22T08:00:00Z"}"#,
        ).unwrap();
        let signal = serde_json::from_str::<ResetSignalResponse>(
            r#"{"dataAsOf":"2026-08-23T10:15:00Z","forecast":{"probability48h":91},"lastConfirmedReset":{"timestamp":"2026-07-25T03:37:00Z"}}"#,
        ).unwrap();
        let result = aggregate(vec![
            normalize_reset_radar(radar, now()).unwrap(),
            normalize_codex_reset(codex, now()).unwrap(),
            normalize_reset_signal(signal, now()).unwrap(),
        ])
        .unwrap();
        assert_eq!(result.quality, ForecastQuality::Conflicting);
        assert!(result
            .sources
            .iter()
            .all(|source| source.last_reset_at.is_some()));
        let future = serde_json::from_str::<ResetRadarResponse>(
            r#"{"generatedAt":"2026-08-23T10:36:00Z","forecast":{"probability":45,"windowHours":48}}"#,
        ).unwrap();
        assert!(normalize_reset_radar(future, now()).is_none());
    }

    #[test]
    fn rejects_an_unexpected_forecast_window() {
        let response: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:15:21.295Z","forecast":{"probability":85,"windowHours":24}}"#,
        )
        .expect("Reset Radar response should parse");

        assert!(normalize_reset_radar(response, now()).is_none());
    }

    #[test]
    fn rejects_out_of_range_heuristic_scores_instead_of_clamping_them() {
        let response: ResetSignalResponse = serde_json::from_str(
            r#"{"dataAsOf":"2026-08-23T10:11:40.277Z","forecast":{"probability48h":140}}"#,
        )
        .expect("reset signal response should parse");

        assert!(normalize_reset_signal(response, now()).is_none());
    }

    #[test]
    fn duplicate_tracker_origins_do_not_inflate_the_source_count() {
        let first: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:15:21.295Z","forecast":{"probability":40,"windowHours":48}}"#,
        )
        .expect("first response should parse");
        let second: ResetRadarResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-08-23T10:20:21.295Z","forecast":{"probability":42,"windowHours":48}}"#,
        )
        .expect("second response should parse");
        let forecast = aggregate(vec![
            normalize_reset_radar(first, now()).expect("first source"),
            normalize_reset_radar(second, now()).expect("second source"),
        ])
        .expect("deduplicated forecast");

        assert_eq!(forecast.source_count, 1);
        assert_eq!(forecast.sources.len(), 1);
        assert_eq!(forecast.confidence, ForecastConfidence::Low);
    }

    #[test]
    fn duplicate_origin_keeps_the_newest_fetched_snapshot() {
        let mut older = source("old", 10, "https://same.example/", None);
        older.fetched_at -= chrono::Duration::hours(1);
        let newer = source("new", 90, "https://same.example/", None);
        let forecast = aggregate(vec![older, newer]).expect("deduplicated forecast");

        assert_eq!(forecast.score, 90);
        assert_eq!(forecast.sources.len(), 1);
        assert_eq!(forecast.sources[0].name, "new");
    }

    #[test]
    fn corroborated_latest_baseline_excludes_an_old_source_and_reports_range() {
        let forecast = aggregate(vec![
            source(
                "latest-a",
                90,
                "https://a.example/",
                Some("2026-08-23T10:00:00Z"),
            ),
            source(
                "latest-b",
                70,
                "https://b.example/",
                Some("2026-08-23T09:00:00Z"),
            ),
            source(
                "stale",
                5,
                "https://stale.example/",
                Some("2026-08-20T09:00:00Z"),
            ),
        ])
        .expect("forecast with corroborated baseline");

        assert_eq!(forecast.score, 70);
        assert_eq!(forecast.score_min, Some(70));
        assert_eq!(forecast.score_max, Some(90));
        assert_eq!(forecast.source_count, 2);
        assert_eq!(forecast.quality, ForecastQuality::Consistent);
        assert_eq!(forecast.exclusions.len(), 1);
        assert_eq!(forecast.exclusions[0].name, "stale");
        assert_eq!(forecast.sources.len(), 3);
        assert!(!forecast.sources[2].included);
        assert!(forecast.sources[2].baseline_verified);
    }

    #[test]
    fn conflicting_baselines_suppress_consensus_quality_without_fabricating_a_score() {
        let forecast = aggregate(vec![
            source(
                "newest",
                90,
                "https://newest.example/",
                Some("2026-08-23T10:00:00Z"),
            ),
            source(
                "old",
                80,
                "https://old.example/",
                Some("2026-08-20T10:00:00Z"),
            ),
        ])
        .expect("conflicting forecast");

        assert_eq!(forecast.quality, ForecastQuality::Conflicting);
        assert_eq!(forecast.score, 90);
        assert_eq!(forecast.score_min, Some(90));
        assert_eq!(forecast.score_max, Some(90));
        assert!(forecast.quality_reason.as_deref().is_some_and(
            |reason| reason.contains("primary reference remains visible with low confidence")
        ));
        assert_eq!(forecast.exclusions.len(), 1);
        assert_eq!(forecast.prediction.unwrap().estimate48h, 90);
    }

    #[test]
    fn same_baseline_with_large_score_disagreement_is_not_consensus() {
        let forecast = aggregate(vec![
            source(
                "low-score",
                42,
                "https://low.example/",
                Some("2026-08-23T10:00:00Z"),
            ),
            source(
                "high-score",
                91,
                "https://high.example/",
                Some("2026-08-23T10:00:00Z"),
            ),
        ])
        .expect("large score disagreement forecast");

        assert_eq!(forecast.quality, ForecastQuality::Conflicting);
        assert_eq!(forecast.score, 91);
        assert!(forecast
            .quality_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("25 percentage points")));
    }

    #[test]
    fn excluded_source_does_not_expire_fresh_participating_sources() {
        let mut old = source(
            "old",
            91,
            "https://old.example/",
            Some("2026-07-25T00:00:00Z"),
        );
        old.fetched_at = now() - chrono::Duration::hours(6) + chrono::Duration::minutes(1);
        let mut a = source("a", 42, "https://a.example/", Some("2026-08-23T08:00:00Z"));
        a.fetched_at = now() - chrono::Duration::minutes(10);
        let b = source("b", 45, "https://b.example/", Some("2026-08-23T08:00:00Z"));
        let forecast = aggregate(vec![old, a, b]).expect("fresh participating sources");
        assert_eq!(forecast.fetched_at, "2026-08-23T10:30:00.000Z");
        assert_eq!(forecast.source_count, 2);
        assert!(!forecast.sources[0].included);
        assert_eq!(forecast.sources.len(), 3);
        assert_eq!(forecast.quality, ForecastQuality::Consistent);
    }

    #[test]
    fn unknown_baselines_are_kept_but_marked_unverified() {
        let forecast = aggregate(vec![
            source(
                "known-a",
                80,
                "https://a.example/",
                Some("2026-08-23T10:00:00Z"),
            ),
            source(
                "known-b",
                80,
                "https://b.example/",
                Some("2026-08-23T09:00:00Z"),
            ),
            source("unknown", 100, "https://unknown.example/", None),
        ])
        .expect("forecast with unknown baseline");

        assert_eq!(forecast.quality, ForecastQuality::Limited);
        assert!(forecast.sources[2].included);
        assert!(!forecast.sources[2].baseline_verified);
        assert_eq!(forecast.exclusions.len(), 0);
    }

    #[tokio::test]
    async fn a_slow_source_does_not_discard_a_fast_source() {
        let (slow, fast) = tokio::join!(
            settle_source(
                std::future::pending::<Option<u8>>(),
                Duration::from_millis(5)
            ),
            settle_source(async { Some(42_u8) }, Duration::from_millis(5)),
        );

        assert_eq!(slow, None);
        assert_eq!(fast, Some(42));
    }
}
