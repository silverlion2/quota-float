use serde::{Deserialize, Serialize};
use std::time::Duration;

const FORECAST_API_URL: &str = "https://www.willcodexquotareset.com/api/forecast";
const FORECAST_SOURCE_URL: &str = "https://www.willcodexquotareset.com/";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetForecast {
    pub score: u8,
    pub window_hours: u8,
    pub fetched_at: String,
    pub reset_announced: bool,
    pub source_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForecastResponse {
    fetched_at: String,
    forecast: ForecastPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForecastPayload {
    score: i16,
    #[serde(default)]
    reset_announced: bool,
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

    Some(ResetForecast {
        score: response.forecast.score.clamp(0, 100) as u8,
        window_hours: 48,
        fetched_at: response.fetched_at,
        reset_announced: response.forecast.reset_announced,
        source_url: FORECAST_SOURCE_URL.into(),
    })
}
