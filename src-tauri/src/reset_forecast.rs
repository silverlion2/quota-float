use serde::{Deserialize, Serialize};
use std::time::Duration;

const FORECAST_API_URL: &str = "https://codexresetradar.com/api/status";
const FORECAST_SOURCE_URL: &str = "https://codexresetradar.com/";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecast {
    pub score: u8,
    pub window_hours: u8,
    pub fetched_at: String,
    pub reset_announced: bool,
    pub reset_at: Option<String>,
    pub source_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForecastResponse {
    generated_at: String,
    forecast: ForecastPayload,
    #[serde(default)]
    reset_today_utc: bool,
    #[serde(default)]
    reset_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForecastPayload {
    probability: i16,
    window_hours: u8,
}

fn normalize(response: ForecastResponse) -> ResetForecast {
    ResetForecast {
        score: response.forecast.probability.clamp(0, 100) as u8,
        window_hours: response.forecast.window_hours,
        fetched_at: response.generated_at,
        reset_announced: response.reset_today_utc,
        reset_at: response.reset_at,
        source_url: FORECAST_SOURCE_URL.into(),
    }
}

pub async fn fetch(client: &reqwest::Client) -> Option<ResetForecast> {
    let request = async {
        let response = client
            .get(FORECAST_API_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await?
            .error_for_status()?;
        response.json::<ForecastResponse>().await
    };

    let response = tokio::time::timeout(Duration::from_secs(4), request)
        .await
        .ok()?
        .ok()?;

    Some(normalize(response))
}

#[cfg(test)]
mod tests {
    use super::{normalize, ForecastResponse};

    #[test]
    fn parses_reset_radar_status_shape() {
        let response: ForecastResponse = serde_json::from_str(
            r#"{"generatedAt":"2026-07-21T06:00:08.979Z","forecast":{"probability":85,"windowHours":48},"resetTodayUtc":true,"resetAt":"2026-07-21T05:30:00Z"}"#,
        )
        .expect("Reset Radar response should parse");
        let forecast = normalize(response);

        assert_eq!(forecast.score, 85);
        assert_eq!(forecast.window_hours, 48);
        assert_eq!(forecast.fetched_at, "2026-07-21T06:00:08.979Z");
        assert!(forecast.reset_announced);
        assert_eq!(forecast.reset_at.as_deref(), Some("2026-07-21T05:30:00Z"));
        assert_eq!(forecast.source_url, "https://codexresetradar.com/");
    }
}
