use std::{fs, path::PathBuf};

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde_json::Value;

use crate::models::{ProviderSnapshot, UsageWindow};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const MAX_CREDENTIAL_BYTES: u64 = 256 * 1024;
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;

struct Auth {
    access_token: String,
    plan: Option<String>,
    expires_at_ms: Option<i64>,
}

fn credential_path() -> Option<PathBuf> {
    std::env::var_os("CLAUDE_CREDENTIALS_PATH")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("CLAUDE_CONFIG_DIR")
                .map(PathBuf::from)
                .map(|directory| directory.join(".credentials.json"))
        })
        .or_else(|| dirs::home_dir().map(|home| home.join(".claude").join(".credentials.json")))
}

fn parse_auth(value: &Value) -> Result<Auth, &'static str> {
    let oauth = value
        .get("claudeAiOauth")
        .ok_or("Claude Code OAuth login was not found.")?;
    let access_token = oauth
        .get("accessToken")
        .or_else(|| oauth.get("access_token"))
        .and_then(Value::as_str)
        .filter(|token| !token.trim().is_empty())
        .ok_or("Claude Code login expired. Please sign in again.")?
        .to_owned();
    let plan = oauth
        .get("subscriptionType")
        .or_else(|| oauth.get("subscription_type"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let expires_at_ms = oauth
        .get("expiresAt")
        .or_else(|| oauth.get("expires_at"))
        .and_then(Value::as_i64);
    Ok(Auth {
        access_token,
        plan,
        expires_at_ms,
    })
}

fn load_file_auth() -> Result<Option<Auth>, &'static str> {
    let Some(path) = credential_path() else {
        return Ok(None);
    };
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(None),
    };
    if !metadata.is_file() || metadata.len() > MAX_CREDENTIAL_BYTES {
        return Err("Claude Code login data is unavailable.");
    }
    let raw = fs::read_to_string(path).map_err(|_| "Claude Code login data could not be read.")?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|_| "Claude Code login format has changed.")?;
    parse_auth(&value).map(Some)
}

#[cfg(target_os = "macos")]
fn load_keychain_auth() -> Result<Option<Auth>, &'static str> {
    use std::process::Command;

    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .map_err(|_| "Claude Code Keychain login could not be read.")?;
    if !output.status.success() {
        return Ok(None);
    }
    if output.stdout.len() as u64 > MAX_CREDENTIAL_BYTES {
        return Err("Claude Code Keychain login is invalid.");
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "Claude Code Keychain login format has changed.")?;
    parse_auth(&value).map(Some)
}

#[cfg(not(target_os = "macos"))]
fn load_keychain_auth() -> Result<Option<Auth>, &'static str> {
    Ok(None)
}

fn load_auth() -> Result<Option<Auth>, &'static str> {
    if let Some(token) = std::env::var("CLAUDE_CODE_OAUTH_TOKEN")
        .ok()
        .filter(|token| !token.trim().is_empty())
    {
        return Ok(Some(Auth {
            access_token: token,
            plan: None,
            expires_at_ms: None,
        }));
    }
    if let Some(auth) = load_file_auth()? {
        return Ok(Some(auth));
    }
    load_keychain_auth()
}

fn headers(auth: &Auth) -> Result<HeaderMap, &'static str> {
    let mut result = HeaderMap::new();
    let mut bearer = HeaderValue::from_str(&format!("Bearer {}", auth.access_token))
        .map_err(|_| "Claude Code login data is invalid.")?;
    bearer.set_sensitive(true);
    result.insert(AUTHORIZATION, bearer);
    result.insert(ACCEPT, HeaderValue::from_static("application/json"));
    result.insert(
        "anthropic-beta",
        HeaderValue::from_static("oauth-2025-04-20"),
    );
    result.insert(
        USER_AGENT,
        HeaderValue::from_static(concat!(
            "claude-code/QuotaFloat-",
            env!("CARGO_PKG_VERSION")
        )),
    );
    Ok(result)
}

fn parse_window(value: Option<&Value>, window_seconds: u64) -> Option<UsageWindow> {
    let value = value?;
    let utilization = value.get("utilization")?.as_f64()?;
    let resets_at = value
        .get("resets_at")
        .or_else(|| value.get("resetsAt"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    Some(UsageWindow {
        remaining_percent: (100.0 - utilization).clamp(0.0, 100.0),
        resets_at,
        window_seconds,
    })
}

async fn limited_json(mut response: reqwest::Response) -> Result<Value, ()> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err(());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if bytes.len().saturating_add(chunk.len()) as u64 > MAX_RESPONSE_BYTES {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}

fn failure(status: &str, message: &str) -> ProviderSnapshot {
    ProviderSnapshot::provider_failure("claude", "CLAUDE", status, message)
}

pub async fn fetch_snapshot(client: &reqwest::Client) -> Option<ProviderSnapshot> {
    let auth = match load_auth() {
        Ok(Some(auth)) => auth,
        Ok(None) => return None,
        Err(message) => return Some(failure("signed_out", message)),
    };
    if auth
        .expires_at_ms
        .is_some_and(|expires_at| expires_at <= chrono::Utc::now().timestamp_millis())
    {
        return Some(failure(
            "signed_out",
            "Claude Code login expired. Open Claude Code and sign in again.",
        ));
    }
    let request_headers = match headers(&auth) {
        Ok(headers) => headers,
        Err(message) => return Some(failure("signed_out", message)),
    };
    let response = match client.get(USAGE_URL).headers(request_headers).send().await {
        Ok(response) if response.status().is_success() => response,
        Ok(response) if matches!(response.status().as_u16(), 401 | 403) => {
            return Some(failure(
                "signed_out",
                "Claude Code login expired. Open Claude Code and sign in again.",
            ));
        }
        Ok(response) if response.status().as_u16() == 429 => {
            return Some(failure(
                "unavailable",
                "Claude usage service is rate limited. It will retry automatically.",
            ));
        }
        Ok(_) => {
            return Some(failure(
                "unavailable",
                "Claude usage service is temporarily unavailable.",
            ));
        }
        Err(_) => {
            return Some(failure(
                "unavailable",
                "Network unavailable. Claude will retry automatically.",
            ));
        }
    };
    let usage = match limited_json(response).await {
        Ok(usage) => usage,
        Err(_) => {
            return Some(failure(
                "unavailable",
                "Claude usage response format has changed.",
            ));
        }
    };
    let short_window = parse_window(usage.get("five_hour"), 18_000);
    let weekly_window = parse_window(usage.get("seven_day"), 604_800);
    let monthly_window = parse_window(usage.get("extra_usage"), 2_592_000);
    if short_window.is_none() && weekly_window.is_none() && monthly_window.is_none() {
        return Some(failure(
            "unavailable",
            "Claude usage response did not include a supported quota window.",
        ));
    }

    Some(ProviderSnapshot {
        provider: "claude".into(),
        display_name: "CLAUDE".into(),
        plan: auth.plan,
        short_window,
        weekly_window,
        monthly_window,
        reset_credits: None,
        reset_credit_expires_at: Vec::new(),
        balance_remaining: None,
        balance_unit: None,
        updated_at: chrono::Utc::now().to_rfc3339(),
        status: "ok".into(),
        message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_only_the_claude_oauth_token() {
        let auth = parse_auth(&json!({
            "mcpOAuth": { "accessToken": "wrong-token" },
            "claudeAiOauth": {
                "accessToken": "claude-token",
                "subscriptionType": "max",
                "expiresAt": 4_102_444_800_000_i64
            }
        }))
        .expect("fixture should parse");
        assert_eq!(auth.access_token, "claude-token");
        assert_eq!(auth.plan.as_deref(), Some("max"));
    }

    #[test]
    fn converts_anthropic_utilization_to_remaining_quota() {
        let value = json!({ "utilization": 37.5, "resets_at": "2026-08-23T00:00:00Z" });
        let window = parse_window(Some(&value), 18_000).expect("fixture should parse");
        assert_eq!(window.remaining_percent, 62.5);
        assert_eq!(window.window_seconds, 18_000);
        assert_eq!(window.resets_at.as_deref(), Some("2026-08-23T00:00:00Z"));
    }

    #[test]
    fn rejects_unrelated_or_missing_tokens() {
        assert!(parse_auth(&json!({ "mcpOAuth": { "accessToken": "wrong" } })).is_err());
        assert!(parse_auth(&json!({ "claudeAiOauth": {} })).is_err());
    }
}
