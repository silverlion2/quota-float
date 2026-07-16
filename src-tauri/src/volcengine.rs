use std::{io::ErrorKind, process::Stdio, time::Duration};

use serde_json::Value;
use tokio::{process::Command, time::timeout};

use crate::models::{ProviderSnapshot, UsageWindow};

const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

fn parse_snapshot(value: &Value) -> Result<ProviderSnapshot, &'static str> {
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .or_else(|| value.pointer("/data/items").and_then(Value::as_array))
        .ok_or("Ark CLI returned an unsupported Coding Plan response.")?;
    let item = items
        .iter()
        .find(|item| item.get("product").and_then(Value::as_str) == Some("coding-plan"))
        .ok_or("No Coding Plan subscription was found.")?;
    if item.get("subscribed").and_then(Value::as_bool) == Some(false) {
        return Err("No active Coding Plan subscription was found.");
    }
    let weekly = item
        .get("periods")
        .and_then(Value::as_array)
        .and_then(|periods| {
            periods
                .iter()
                .find(|period| period.get("label").and_then(Value::as_str) == Some("weekly"))
        })
        .ok_or("Coding Plan response is missing the weekly quota.")?;
    let used_percent = weekly
        .get("percent")
        .and_then(Value::as_f64)
        .ok_or("Coding Plan weekly quota has an unsupported format.")?;
    let updated_at = item
        .get("updated_at")
        .and_then(Value::as_i64)
        .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
        .map(|time| time.to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    Ok(ProviderSnapshot {
        provider: "volcengine".into(),
        display_name: "VOLCENGINE".into(),
        plan: item
            .get("edition")
            .and_then(Value::as_str)
            .map(|edition| match edition {
                "personal" => "Coding Plan Personal".to_string(),
                value => format!("Coding Plan {}", value),
            })
            .or_else(|| Some("Coding Plan".into())),
        short_window: None,
        weekly_window: Some(UsageWindow {
            remaining_percent: (100.0 - used_percent).clamp(0.0, 100.0),
            resets_at: weekly
                .get("reset_at")
                .and_then(Value::as_str)
                .map(str::to_owned),
            window_seconds: 604_800,
        }),
        reset_credits: None,
        reset_credit_expires_at: Vec::new(),
        balance_remaining: None,
        balance_unit: None,
        updated_at,
        status: "ok".into(),
        message: None,
    })
}

pub async fn fetch_snapshot() -> Option<ProviderSnapshot> {
    #[cfg(windows)]
    let program = "arkcli.cmd";
    #[cfg(not(windows))]
    let program = "arkcli";
    let mut command = Command::new(program);
    command
        .args([
            "usage",
            "plan",
            "--product",
            "coding-plan",
            "--format",
            "json",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }

    let output = match timeout(Duration::from_secs(15), command.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(error)) if error.kind() == ErrorKind::NotFound => return None,
        Ok(Err(_)) => {
            return Some(ProviderSnapshot::provider_failure(
                "volcengine",
                "VOLCENGINE",
                "unavailable",
                "Ark CLI could not be started.",
            ))
        }
        Err(_) => {
            return Some(ProviderSnapshot::provider_failure(
                "volcengine",
                "VOLCENGINE",
                "unavailable",
                "Coding Plan quota request timed out.",
            ))
        }
    };
    if output.stdout.len() > MAX_OUTPUT_BYTES || output.stderr.len() > MAX_OUTPUT_BYTES {
        return Some(ProviderSnapshot::provider_failure(
            "volcengine",
            "VOLCENGINE",
            "unavailable",
            "Ark CLI returned too much data.",
        ));
    }
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        let signed_out = ["auth", "login", "unauthorized", "expired"]
            .iter()
            .any(|needle| error.contains(needle));
        return Some(ProviderSnapshot::provider_failure(
            "volcengine",
            "VOLCENGINE",
            if signed_out {
                "signed_out"
            } else {
                "unavailable"
            },
            if signed_out {
                "Sign in to Ark CLI to view Coding Plan quota."
            } else {
                "Coding Plan quota is temporarily unavailable."
            },
        ));
    }
    let value: Value = match serde_json::from_slice(&output.stdout) {
        Ok(value) => value,
        Err(_) => {
            return Some(ProviderSnapshot::provider_failure(
                "volcengine",
                "VOLCENGINE",
                "unavailable",
                "Ark CLI returned an unsupported response.",
            ))
        }
    };
    Some(parse_snapshot(&value).unwrap_or_else(|message| {
        ProviderSnapshot::provider_failure("volcengine", "VOLCENGINE", "unavailable", message)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_official_cli_plan_shape() {
        let value = serde_json::json!({
            "items": [{
                "product": "coding-plan",
                "edition": "personal",
                "subscribed": true,
                "updated_at": 1_784_207_732,
                "periods": [
                    {"label": "session", "percent": 0},
                    {"label": "weekly", "percent": 15.5, "reset_at": "2026-07-20T00:00:00+08:00"},
                    {"label": "monthly", "percent": 37.2, "reset_at": "2026-08-09T23:59:59+08:00"}
                ]
            }]
        });
        let snapshot = parse_snapshot(&value).unwrap();
        assert_eq!(snapshot.plan.as_deref(), Some("Coding Plan Personal"));
        assert_eq!(snapshot.weekly_window.unwrap().remaining_percent, 84.5);
    }
}
