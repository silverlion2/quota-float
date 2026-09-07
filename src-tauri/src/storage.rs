use crate::models::WidgetPreferences;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MAX_APP_DATA_BYTES: u64 = 20 * 1024 * 1024;
const MAX_LEGACY_RUNTIME_READ_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RUNTIME_HISTORY_ITEMS: usize = 120_000;
const MAX_RUNTIME_DAILY_USAGE_ITEMS: usize = 100_000;
const MAX_RUNTIME_EVENT_ITEMS: usize = 200;
const MAX_RUNTIME_LAYOUT_ITEMS: usize = 12;
const MAX_FOCUS_HISTORY_ITEMS: usize = 10_000;
const MAX_FOCUS_DAILY_USAGE_ITEMS: usize = 120;
const MAX_FOCUS_PACE_BASELINES: usize = 3;
pub const MAX_FOCUS_HISTORY_DAYS: u32 = 90;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPanelHistory {
    pub history: Vec<Value>,
    pub daily_usage: Vec<Value>,
    pub daily_pace_baselines: Map<String, Value>,
}

pub fn load_preferences(path: &Path) -> WidgetPreferences {
    let parse = |candidate: &Path| {
        read_bytes_candidate_bounded(candidate, MAX_APP_DATA_BYTES)
            .and_then(|raw| serde_json::from_slice::<WidgetPreferences>(&raw).ok())
    };
    if let Some(value) = parse(path) {
        return value.normalized();
    }
    if let Some(value) = parse(&path.with_extension("json.bak")) {
        eprintln!("preferences recovered from backup");
        return value.normalized();
    }
    WidgetPreferences::default()
}

pub fn persist_preferences(path: &Path, value: &WidgetPreferences) -> Result<(), String> {
    let serialized =
        serde_json::to_vec_pretty(value).map_err(|_| "failed to serialize settings".to_string())?;
    persist_serialized(
        path,
        &serialized,
        "settings directory",
        "temporary settings file",
        "settings",
        "settings",
    )
}

fn persist_serialized(
    path: &Path,
    serialized: &[u8],
    directory_label: &str,
    temporary_label: &str,
    write_label: &str,
    backup_label: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| format!("failed to create {directory_label}"))?;
    }
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let mut file =
        fs::File::create(&temporary).map_err(|_| format!("failed to create {temporary_label}"))?;
    file.write_all(serialized)
        .and_then(|_| file.sync_all())
        .map_err(|_| format!("failed to write {write_label}"))?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|_| format!("failed to back up {backup_label}"))?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(format!("failed to commit {write_label}: {error}"));
    }
    Ok(())
}

pub fn persist_serialized_json(path: &Path, serialized: &[u8]) -> Result<(), String> {
    persist_serialized(
        path,
        serialized,
        "data directory",
        "temporary data file",
        "application data",
        "application data",
    )
}

pub fn persist_json_value(path: &Path, value: &Value) -> Result<(), String> {
    let serialized = serde_json::to_vec(value)
        .map_err(|_| "failed to serialize application data".to_string())?;
    persist_serialized_json(path, &serialized)
}

fn serialize_compact(value: &Value, failure: &str, too_large: &str) -> Result<Vec<u8>, String> {
    let serialized = serde_json::to_vec(value).map_err(|_| failure.to_string())?;
    if serialized.len() as u64 > MAX_APP_DATA_BYTES {
        return Err(too_large.to_string());
    }
    Ok(serialized)
}

pub fn serialize_backup(value: &Value) -> Result<Vec<u8>, String> {
    serialize_compact(
        value,
        "failed to serialize backup data",
        "backup exceeds the 20 MiB safety limit",
    )
}

fn runtime_state_default() -> Value {
    serde_json::json!({
        "schemaVersion": 2,
        "history": [],
        "dailyUsage": [],
        "usageMemory": {
            "retentionDays": 0,
            "firstCapturedAt": null,
            "lastCapturedAt": null,
            "totalSamples": 0
        },
        "events": [],
        "savedLayouts": [],
        "lastNotifications": {},
        "dailyPaceBaselines": {}
    })
}

fn validate_runtime_state(value: &Value) -> Result<(), String> {
    let Some(state) = value.as_object() else {
        return Err("runtime state must be a JSON object".to_string());
    };
    if let Some(version) = state.get("schemaVersion") {
        let Some(version) = version.as_u64() else {
            return Err("runtime state schema version is invalid".to_string());
        };
        if !(1..=2).contains(&version) {
            return Err("runtime state schema version is unsupported".to_string());
        }
    }
    for (field, limit) in [
        ("history", MAX_RUNTIME_HISTORY_ITEMS),
        ("dailyUsage", MAX_RUNTIME_DAILY_USAGE_ITEMS),
        ("events", MAX_RUNTIME_EVENT_ITEMS),
        ("savedLayouts", MAX_RUNTIME_LAYOUT_ITEMS),
    ] {
        if let Some(section) = state.get(field) {
            let Some(items) = section.as_array() else {
                return Err(format!("runtime state {field} section is invalid"));
            };
            if items.len() > limit {
                return Err(format!(
                    "runtime state {field} section exceeds its safety limit"
                ));
            }
        }
    }
    if state
        .get("usageMemory")
        .is_some_and(|section| !section.is_object())
    {
        return Err("runtime state usageMemory section is invalid".to_string());
    }
    for field in ["lastNotifications", "dailyPaceBaselines"] {
        if state.get(field).is_some_and(|section| !section.is_object()) {
            return Err(format!("runtime state {field} section is invalid"));
        }
    }
    Ok(())
}

pub fn persist_runtime_state(path: &Path, value: &Value) -> Result<(), String> {
    validate_runtime_state(value)?;
    let serialized = serialize_compact(
        value,
        "failed to serialize application data",
        "runtime state exceeds the 20 MiB safety limit",
    )?;
    persist_serialized_json(path, &serialized)
}

pub fn read_bytes_candidate_bounded(path: &Path, max_bytes: u64) -> Option<Vec<u8>> {
    let file = fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > max_bytes {
        return None;
    }
    let mut raw = Vec::with_capacity(metadata.len().min(max_bytes) as usize);
    file.take(max_bytes.saturating_add(1))
        .read_to_end(&mut raw)
        .ok()?;
    (raw.len() as u64 <= max_bytes).then_some(raw)
}

pub fn read_json_candidate_bounded(path: &Path, max_bytes: u64) -> Option<Value> {
    read_bytes_candidate_bounded(path, max_bytes).and_then(|raw| serde_json::from_slice(&raw).ok())
}

pub fn persist_app_data(
    preferences_path: &Path,
    runtime_state_path: &Path,
    previous_preferences: &WidgetPreferences,
    next_preferences: &WidgetPreferences,
    next_runtime_state: &Value,
) -> Result<(), String> {
    persist_preferences(preferences_path, next_preferences)?;
    if let Err(error) = persist_runtime_state(runtime_state_path, next_runtime_state) {
        return match persist_preferences(preferences_path, previous_preferences) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; failed to restore previous settings: {rollback_error}"
            )),
        };
    }
    Ok(())
}

pub fn read_runtime_state(path: &Path) -> Value {
    [path.to_path_buf(), path.with_extension("json.bak")]
        .into_iter()
        .filter_map(|candidate| {
            read_json_candidate_bounded(&candidate, MAX_LEGACY_RUNTIME_READ_BYTES)
        })
        .find(|value| validate_runtime_state(value).is_ok())
        .unwrap_or_else(runtime_state_default)
}

pub fn read_backup(path: &Path) -> Result<Value, String> {
    read_json_candidate_bounded(path, MAX_APP_DATA_BYTES).ok_or_else(|| {
        "backup file is not valid JSON or exceeds the 20 MiB safety limit".to_string()
    })
}

pub fn create_automatic_backup(preferences_path: &Path, bundle: &Value) -> Result<PathBuf, String> {
    let config_dir = preferences_path
        .parent()
        .ok_or_else(|| "settings directory unavailable".to_string())?;
    let backup_dir = config_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|_| "failed to create backup directory".to_string())?;
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let target = backup_dir.join(format!("quota-float-{stamp}.json"));
    let serialized = serialize_backup(bundle)?;
    persist_serialized_json(&target, &serialized)?;

    let mut backups = fs::read_dir(&backup_dir)
        .map_err(|_| "failed to list backups".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    backups.sort();
    let remove_count = backups.len().saturating_sub(10);
    for old in backups.into_iter().take(remove_count) {
        let _ = fs::remove_file(old);
    }
    Ok(target)
}

pub fn restore_latest_backup(preferences_path: &Path) -> Result<Value, String> {
    let config_dir = preferences_path
        .parent()
        .ok_or_else(|| "settings directory unavailable".to_string())?;
    let backup_dir = config_dir.join("backups");
    let mut backups = fs::read_dir(backup_dir)
        .map_err(|_| "no automatic backup is available".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    backups.sort();
    let latest = backups
        .pop()
        .ok_or_else(|| "no automatic backup is available".to_string())?;
    read_json_candidate_bounded(&latest, MAX_LEGACY_RUNTIME_READ_BYTES)
        .ok_or_else(|| "automatic backup is invalid or exceeds the safety limit".to_string())
}

fn timestamp_at_or_after(value: &Value, field: &str, cutoff: DateTime<Utc>) -> bool {
    value
        .get(field)
        .and_then(Value::as_str)
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|value| value.with_timezone(&Utc) >= cutoff)
}

fn filtered_recent_items(
    state: &Map<String, Value>,
    field: &str,
    provider: &str,
    timestamp_field: &str,
    cutoff: DateTime<Utc>,
    limit: usize,
) -> Vec<Value> {
    let mut values = state
        .get(field)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .filter(|value| value.get("provider").and_then(Value::as_str) == Some(provider))
        .filter(|value| timestamp_at_or_after(value, timestamp_field, cutoff))
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    values.reverse();
    values
}

fn focus_panel_history_from_value(
    value: &Value,
    provider: &str,
    range_days: u32,
    now: DateTime<Utc>,
) -> FocusPanelHistory {
    let range_days = range_days.clamp(1, MAX_FOCUS_HISTORY_DAYS);
    let cutoff = now - Duration::days(i64::from(range_days));
    let Some(state) = value.as_object() else {
        return FocusPanelHistory {
            history: Vec::new(),
            daily_usage: Vec::new(),
            daily_pace_baselines: Map::new(),
        };
    };
    let history = filtered_recent_items(
        state,
        "history",
        provider,
        "capturedAt",
        cutoff,
        MAX_FOCUS_HISTORY_ITEMS,
    );
    let daily_usage = filtered_recent_items(
        state,
        "dailyUsage",
        provider,
        "updatedAt",
        now - Duration::days(i64::from(range_days) + 1),
        MAX_FOCUS_DAILY_USAGE_ITEMS,
    );
    let daily_pace_baselines = state
        .get("dailyPaceBaselines")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter(|(_, value)| value.get("provider").and_then(Value::as_str) == Some(provider))
        .take(MAX_FOCUS_PACE_BASELINES)
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    FocusPanelHistory {
        history,
        daily_usage,
        daily_pace_baselines,
    }
}

pub fn read_focus_panel_history(path: &Path, provider: &str, range_days: u32) -> FocusPanelHistory {
    focus_panel_history_from_value(&read_runtime_state(path), provider, range_days, Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_root(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "quota-float-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn app_data_restore_persists_both_files() {
        let root = temporary_root("restore-success");
        let preferences_path = root.join("preferences.json");
        let runtime_path = root.join("runtime-state.json");
        let previous = WidgetPreferences::default();
        let mut next = previous.clone();
        next.alert_threshold = 12;
        let runtime = serde_json::json!({ "schemaVersion": 2, "events": [] });

        persist_app_data(&preferences_path, &runtime_path, &previous, &next, &runtime)
            .expect("app data should persist");
        assert_eq!(load_preferences(&preferences_path).alert_threshold, 12);
        assert_eq!(read_runtime_state(&runtime_path), runtime);
        fs::remove_dir_all(root).expect("temporary restore directory should be removable");
    }

    #[test]
    fn app_data_restore_rolls_back_settings_when_runtime_write_fails() {
        let root = temporary_root("restore-rollback");
        fs::create_dir_all(&root).expect("temporary restore directory should be created");
        let preferences_path = root.join("preferences.json");
        let previous = WidgetPreferences::default();
        persist_preferences(&preferences_path, &previous)
            .expect("previous settings should persist");
        let mut next = previous.clone();
        next.alert_threshold = 12;
        let blocked_parent = root.join("blocked");
        fs::write(&blocked_parent, b"not a directory").expect("blocking file should be created");
        let runtime_path = blocked_parent.join("runtime-state.json");

        assert!(persist_app_data(
            &preferences_path,
            &runtime_path,
            &previous,
            &next,
            &serde_json::json!({ "schemaVersion": 2 }),
        )
        .is_err());
        assert_eq!(
            load_preferences(&preferences_path).alert_threshold,
            previous.alert_threshold
        );
        fs::remove_dir_all(root).expect("temporary restore directory should be removable");
    }

    #[test]
    fn compact_runtime_and_backup_keep_the_full_legal_history_importable() {
        let root = temporary_root("large-runtime");
        let runtime_path = root.join("runtime-state.json");
        let history = (0..MAX_RUNTIME_HISTORY_ITEMS)
            .map(|index| {
                serde_json::json!({
                    "provider": "codex",
                    "capturedAt": "2026-09-07T00:00:00Z",
                    "metric": index % 101,
                    "metricKind": "percent",
                    "status": "ok",
                    "resetsAt": null
                })
            })
            .collect::<Vec<_>>();
        let runtime = serde_json::json!({
            "schemaVersion": 2,
            "history": history,
            "dailyUsage": [],
            "usageMemory": {},
            "events": [],
            "savedLayouts": [],
            "lastNotifications": {},
            "dailyPaceBaselines": {}
        });
        let pretty = serde_json::to_vec_pretty(&runtime).unwrap();
        let pretty_bytes = pretty.len() as u64;
        fs::create_dir_all(&root).unwrap();
        fs::write(&runtime_path, &pretty).expect("legacy pretty runtime should persist");
        let legacy = read_runtime_state(&runtime_path);
        assert_eq!(
            legacy["history"].as_array().map(Vec::len),
            Some(MAX_RUNTIME_HISTORY_ITEMS)
        );

        persist_runtime_state(&runtime_path, &runtime).expect("compact runtime should fit");
        let bundle = serde_json::json!({
            "schemaVersion": 1,
            "preferences": {},
            "runtimeState": runtime
        });
        let serialized_backup = serialize_backup(&bundle).expect("compact backup should fit");
        let backup_path = root.join("export.json");
        persist_serialized_json(&backup_path, &serialized_backup)
            .expect("compact backup should persist");
        let imported = read_backup(&backup_path).expect("compact backup should import");
        let restored = read_runtime_state(&runtime_path);
        let compact_runtime_bytes = fs::metadata(&runtime_path).unwrap().len();

        println!(
            "large runtime bytes: pretty={pretty_bytes}, compact={compact_runtime_bytes}, backup={}",
            serialized_backup.len()
        );

        assert!(pretty_bytes > MAX_APP_DATA_BYTES);
        assert!(pretty_bytes <= MAX_LEGACY_RUNTIME_READ_BYTES);
        assert!(compact_runtime_bytes <= MAX_APP_DATA_BYTES);
        assert!(serialized_backup.len() as u64 <= MAX_APP_DATA_BYTES);
        assert_eq!(
            restored["history"].as_array().map(Vec::len),
            Some(MAX_RUNTIME_HISTORY_ITEMS)
        );
        assert_eq!(
            imported["runtimeState"]["history"].as_array().map(Vec::len),
            Some(MAX_RUNTIME_HISTORY_ITEMS)
        );
        fs::remove_dir_all(root).expect("temporary runtime directory should be removable");
    }

    #[test]
    fn oversized_runtime_is_rejected_without_replacing_the_previous_state() {
        let root = temporary_root("oversized-runtime");
        let runtime_path = root.join("runtime-state.json");
        let previous = serde_json::json!({ "schemaVersion": 2, "history": [] });
        persist_runtime_state(&runtime_path, &previous).expect("previous state should persist");
        let oversized = serde_json::json!({
            "schemaVersion": 2,
            "history": [],
            "dailyUsage": [{ "provider": "codex", "payload": "x".repeat(MAX_APP_DATA_BYTES as usize) }]
        });

        assert_eq!(
            persist_runtime_state(&runtime_path, &oversized).unwrap_err(),
            "runtime state exceeds the 20 MiB safety limit"
        );
        assert_eq!(read_runtime_state(&runtime_path), previous);
        fs::remove_dir_all(root).expect("temporary runtime directory should be removable");
    }

    #[test]
    fn runtime_state_validation_is_bounded_and_legacy_compatible() {
        assert!(validate_runtime_state(&serde_json::json!({
            "history": [],
            "unknownLegacyField": true
        }))
        .is_ok());
        assert!(validate_runtime_state(&serde_json::json!({ "schemaVersion": 1 })).is_ok());
        assert_eq!(
            validate_runtime_state(&serde_json::json!({ "schemaVersion": 3 })).unwrap_err(),
            "runtime state schema version is unsupported"
        );
        assert_eq!(
            validate_runtime_state(&serde_json::json!({
                "events": vec![Value::Null; MAX_RUNTIME_EVENT_ITEMS + 1]
            }))
            .unwrap_err(),
            "runtime state events section exceeds its safety limit"
        );
    }

    #[test]
    fn invalid_runtime_primary_falls_back_to_valid_bounded_backup() {
        let root = temporary_root("runtime-fallback");
        fs::create_dir_all(&root).expect("temporary directory should be created");
        let target = root.join("runtime-state.json");
        fs::write(&target, br#"{"schemaVersion":99}"#).expect("invalid primary should persist");
        let backup = target.with_extension("json.bak");
        let expected = serde_json::json!({ "schemaVersion": 2, "history": [] });
        fs::write(&backup, serde_json::to_vec(&expected).unwrap()).expect("backup should persist");

        assert_eq!(read_runtime_state(&target), expected);
        fs::remove_dir_all(root).expect("temporary runtime directory should be removable");
    }

    #[test]
    fn focus_history_is_single_provider_time_bounded_and_size_bounded() {
        let now = DateTime::parse_from_rfc3339("2026-09-07T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let history = (0..(MAX_FOCUS_HISTORY_ITEMS + 2))
            .map(|index| {
                serde_json::json!({
                    "provider": "codex",
                    "capturedAt": "2026-09-07T00:00:00Z",
                    "metric": index
                })
            })
            .chain([
                serde_json::json!({ "provider": "qoder", "capturedAt": "2026-09-07T00:00:00Z" }),
                serde_json::json!({ "provider": "codex", "capturedAt": "2026-01-01T00:00:00Z" }),
            ])
            .collect::<Vec<_>>();
        let value = serde_json::json!({
            "history": history,
            "dailyUsage": [
                { "provider": "codex", "updatedAt": "2026-09-06T00:00:00Z" },
                { "provider": "codex", "updatedAt": "2026-06-09T00:00:00Z" },
                { "provider": "codex", "updatedAt": "2026-06-08T00:00:00Z" },
                { "provider": "qoder", "updatedAt": "2026-09-06T00:00:00Z" }
            ],
            "dailyPaceBaselines": {
                "codex:weekly": { "provider": "codex" },
                "qoder:weekly": { "provider": "qoder" }
            }
        });

        let result = focus_panel_history_from_value(&value, "codex", 90, now);

        assert_eq!(result.history.len(), MAX_FOCUS_HISTORY_ITEMS);
        assert!(result
            .history
            .iter()
            .all(|value| value["provider"] == "codex"));
        assert_eq!(result.daily_usage.len(), 2);
        assert!(result
            .daily_usage
            .iter()
            .any(|value| value["updatedAt"] == "2026-06-09T00:00:00Z"));
        assert!(!result
            .daily_usage
            .iter()
            .any(|value| value["updatedAt"] == "2026-06-08T00:00:00Z"));
        assert_eq!(result.daily_pace_baselines.len(), 1);
    }
}
