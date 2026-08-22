mod antigravity;
mod claude;
mod codex;
mod codex_usage;
mod models;
mod provider_registry;
mod qoder;
mod reset_forecast;
mod trae;
mod volcengine;
mod workbuddy;

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

#[cfg(debug_assertions)]
use models::UsageWindow;
use models::{ProviderSnapshot, WidgetPreferences};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_window_state::Builder as WindowStateBuilder;

const COLLAPSED_LOGICAL_WIDTH: f64 = 92.0;
const COLLAPSED_LOGICAL_HEIGHT: f64 = 92.0;
const BAR_TOP_LOGICAL_WIDTH: f64 = 400.0;
const BAR_TOP_LOGICAL_HEIGHT: f64 = 38.0;
const BAR_SIDE_LOGICAL_WIDTH: f64 = 64.0;
const BAR_SIDE_LOGICAL_HEIGHT: f64 = 320.0;
const EXPANDED_LOGICAL_WIDTH: f64 = 552.0;
// The React card reports its intrinsic height immediately after expansion. This is also
// the baseline height when the expanded view has no provider content.
const EXPANDED_LOGICAL_HEIGHT: f64 = 260.0;
const MIN_EXPANDED_LOGICAL_HEIGHT: f64 = EXPANDED_LOGICAL_HEIGHT;
const EDGE_SAFE_INSET_LOGICAL: f64 = 4.0;
// Tauri caps the whole window at 1200 logical pixels. Reserve both transparent
// safety insets so content-driven sizing never requests a window above that cap.
const MAX_EXPANDED_LOGICAL_HEIGHT: f64 = 1_200.0 - EDGE_SAFE_INSET_LOGICAL * 2.0;
const SNAP_THRESHOLD_LOGICAL: f64 = 24.0;
const POSITION_EPSILON: u32 = 2;

#[derive(Clone, Copy)]
enum HorizontalDock {
    Left,
    Right,
}

#[derive(Clone, Copy)]
enum VerticalDock {
    Top,
    Bottom,
}

#[derive(Clone, Copy, Default)]
struct DockState {
    horizontal: Option<HorizontalDock>,
    vertical: Option<VerticalDock>,
}

impl DockState {
    fn is_docked(self) -> bool {
        self.horizontal.is_some() || self.vertical.is_some()
    }
}

#[derive(Clone, Copy)]
struct WidgetRect {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Clone, Copy)]
struct PhysicalBounds {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaPoint {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaSize {
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaPayload {
    position: WorkAreaPoint,
    size: WorkAreaSize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WidgetMode {
    Collapsed,
    Expanded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CompactMode {
    Float,
    Bar,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum BarEdge {
    Top,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BarPlacement {
    edge: BarEdge,
    offset: f64,
}

impl Default for BarPlacement {
    fn default() -> Self {
        Self {
            edge: BarEdge::Top,
            offset: 0.5,
        }
    }
}

#[derive(Clone, Copy)]
struct WidgetGeometryState {
    mode: WidgetMode,
    compact_mode: CompactMode,
    bar_placement: BarPlacement,
    dock: DockState,
    collapsed_rect: WidgetRect,
    expanded_rect: Option<WidgetRect>,
    user_moved_expanded: bool,
}

fn compact_mode(compact_layout: Option<&str>) -> CompactMode {
    if matches!(compact_layout, Some("bar" | "island")) {
        CompactMode::Bar
    } else {
        CompactMode::Float
    }
}

fn bar_placement(bar_edge: Option<&str>, bar_offset: Option<f64>) -> BarPlacement {
    BarPlacement {
        edge: match bar_edge {
            Some("left") => BarEdge::Left,
            Some("right") => BarEdge::Right,
            _ => BarEdge::Top,
        },
        offset: bar_offset
            .filter(|value| value.is_finite())
            .unwrap_or(0.5)
            .clamp(0.0, 1.0),
    }
}

fn collapsed_physical_size(
    compact_mode: CompactMode,
    bar_edge: BarEdge,
    scale_factor: f64,
    safe_inset: u32,
) -> PhysicalSize<u32> {
    let (width, height) = match compact_mode {
        CompactMode::Float => (COLLAPSED_LOGICAL_WIDTH, COLLAPSED_LOGICAL_HEIGHT),
        CompactMode::Bar if bar_edge == BarEdge::Top => {
            (BAR_TOP_LOGICAL_WIDTH, BAR_TOP_LOGICAL_HEIGHT)
        }
        CompactMode::Bar => (BAR_SIDE_LOGICAL_WIDTH, BAR_SIDE_LOGICAL_HEIGHT),
    };
    PhysicalSize::new(
        widget_window_size(width, scale_factor, safe_inset),
        widget_window_size(height, scale_factor, safe_inset),
    )
}

struct AppState {
    client: reqwest::Client,
    preferences: Mutex<WidgetPreferences>,
    preferences_path: PathBuf,
    runtime_state_path: PathBuf,
    fetch_lock: tokio::sync::Mutex<()>,
    snapshot_cache: Mutex<Option<(Instant, Vec<ProviderSnapshot>)>>,
    codex_usage_fetch_lock: tokio::sync::Mutex<()>,
    codex_usage_cache: Mutex<Option<(Instant, codex_usage::CodexTokenUsageReport)>>,
    codex_usage_index_path: PathBuf,
    #[cfg(debug_assertions)]
    simulate_short_window_for_testing: Mutex<bool>,
    geometry: Mutex<Option<WidgetGeometryState>>,
    drag_mode: Mutex<Option<WidgetMode>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppDiagnostics {
    app_version: &'static str,
    platform: &'static str,
    config_directory: String,
    preferences_backup_available: bool,
    runtime_backup_available: bool,
}

fn apply_short_window_test_override(
    _state: &AppState,
    #[allow(unused_mut)] mut snapshots: Vec<ProviderSnapshot>,
) -> Vec<ProviderSnapshot> {
    #[cfg(debug_assertions)]
    if _state
        .simulate_short_window_for_testing
        .lock()
        .map(|value| *value)
        .unwrap_or(false)
    {
        for snapshot in &mut snapshots {
            if snapshot.status == "ok" {
                snapshot.short_window = Some(UsageWindow {
                    remaining_percent: 88.0,
                    resets_at: Some((chrono::Utc::now() + chrono::Duration::hours(3)).to_rfc3339()),
                    window_seconds: 18_000,
                });
            }
        }
    }
    snapshots
}

async fn collect_snapshots(client: &reqwest::Client) -> Vec<ProviderSnapshot> {
    provider_registry::collect(client).await
}

async fn fetch_snapshots_uncached(state: &State<'_, AppState>) -> Vec<ProviderSnapshot> {
    let _guard = state.fetch_lock.lock().await;
    let values = collect_snapshots(&state.client).await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    apply_short_window_test_override(state.inner(), values)
}

fn load_preferences(path: &Path) -> WidgetPreferences {
    let parse = |candidate: &Path| {
        fs::read_to_string(candidate)
            .ok()
            .and_then(|raw| serde_json::from_str::<WidgetPreferences>(&raw).ok())
    };
    if let Some(value) = parse(path) {
        return value.normalized();
    }
    let backup = path.with_extension("json.bak");
    if let Some(value) = parse(&backup) {
        eprintln!("preferences recovered from backup");
        return value.normalized();
    }
    WidgetPreferences::default()
}

fn persist_preferences(path: &Path, value: &WidgetPreferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "failed to create settings directory".to_string())?;
    }
    let serialized =
        serde_json::to_vec_pretty(value).map_err(|_| "failed to serialize settings".to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let mut file = fs::File::create(&temporary)
        .map_err(|_| "failed to create temporary settings file".to_string())?;
    file.write_all(&serialized)
        .and_then(|_| file.sync_all())
        .map_err(|_| "failed to write settings".to_string())?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|_| "failed to back up settings".to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(format!("failed to commit settings: {error}"));
    }
    Ok(())
}

fn persist_json_value(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "failed to create data directory".to_string())?;
    }
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|_| "failed to serialize application data".to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let mut file = fs::File::create(&temporary)
        .map_err(|_| "failed to create temporary data file".to_string())?;
    file.write_all(&serialized)
        .and_then(|_| file.sync_all())
        .map_err(|_| "failed to write application data".to_string())?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|_| "failed to back up application data".to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(format!("failed to commit application data: {error}"));
    }
    Ok(())
}

fn persist_app_data(
    preferences_path: &Path,
    runtime_state_path: &Path,
    previous_preferences: &WidgetPreferences,
    next_preferences: &WidgetPreferences,
    next_runtime_state: &serde_json::Value,
) -> Result<(), String> {
    persist_preferences(preferences_path, next_preferences)?;
    if let Err(error) = persist_json_value(runtime_state_path, next_runtime_state) {
        return match persist_preferences(preferences_path, previous_preferences) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; failed to restore previous settings: {rollback_error}"
            )),
        };
    }
    Ok(())
}

fn read_json_with_backup(path: &Path) -> serde_json::Value {
    [path.to_path_buf(), path.with_extension("json.bak")]
        .into_iter()
        .find_map(|candidate| {
            fs::read_to_string(candidate)
                .ok()
                .and_then(|raw| serde_json::from_str(&raw).ok())
        })
        .unwrap_or_else(|| {
            serde_json::json!({
                "schemaVersion": 2,
                "history": [],
                "dailyUsage": [],
                "usageMemory": {
                    "retentionDays": 90,
                    "firstCapturedAt": null,
                    "lastCapturedAt": null,
                    "totalSamples": 0
                },
                "events": [],
                "savedLayouts": [],
                "lastNotifications": {}
            })
        })
}

#[tauri::command]
fn get_runtime_state(state: State<'_, AppState>) -> serde_json::Value {
    read_json_with_backup(&state.runtime_state_path)
}

#[tauri::command]
fn set_runtime_state(
    runtime_state: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    persist_json_value(&state.runtime_state_path, &runtime_state)
}

#[tauri::command]
fn apply_app_data(
    preferences: WidgetPreferences,
    runtime_state: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let next_preferences = preferences.normalized();
    let mut current_preferences = state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())?;
    persist_app_data(
        &state.preferences_path,
        &state.runtime_state_path,
        &current_preferences,
        &next_preferences,
        &runtime_state,
    )?;
    *current_preferences = next_preferences;
    Ok(())
}

#[tauri::command]
async fn export_app_data(
    bundle: serde_json::Value,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let filename = format!(
        "quota-float-backup-{}.json",
        chrono::Local::now().format("%Y-%m-%d")
    );
    let Some(target) = app
        .dialog()
        .file()
        .add_filter("Quota Float backup", &["json"])
        .set_file_name(filename)
        .blocking_save_file()
        .map(|path| path.into_path())
        .transpose()
        .map_err(|_| "backup path is invalid".to_string())?
    else {
        return Ok(None);
    };
    if target.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err("backup file must use the .json extension".into());
    }
    persist_json_value(&target, &bundle)?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn export_usage_data(
    content: String,
    format: String,
    app: AppHandle,
) -> Result<Option<String>, String> {
    const MAX_EXPORT_BYTES: usize = 20 * 1024 * 1024;
    if content.len() > MAX_EXPORT_BYTES {
        return Err("usage export is too large".into());
    }
    let format = format.to_ascii_lowercase();
    if !matches!(format.as_str(), "csv" | "json" | "svg") {
        return Err("usage export must use .csv, .json, or .svg".into());
    }
    let filename = format!(
        "quota-float-usage-{}.{}",
        chrono::Local::now().format("%Y-%m-%d"),
        format
    );
    let Some(target) = app
        .dialog()
        .file()
        .add_filter("Quota Float usage", &[format.as_str()])
        .set_file_name(filename)
        .blocking_save_file()
        .map(|path| path.into_path())
        .transpose()
        .map_err(|_| "usage export path is invalid".to_string())?
    else {
        return Ok(None);
    };
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case(&format))
    {
        return Err("usage export extension does not match its format".into());
    }
    let mut file =
        fs::File::create(&target).map_err(|_| "failed to create usage export".to_string())?;
    file.write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "failed to write usage export".to_string())?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn import_app_data(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    const MAX_BACKUP_BYTES: u64 = 20 * 1024 * 1024;
    let Some(target) = app
        .dialog()
        .file()
        .add_filter("Quota Float backup", &["json"])
        .blocking_pick_file()
        .map(|path| path.into_path())
        .transpose()
        .map_err(|_| "backup path is invalid".to_string())?
    else {
        return Ok(None);
    };
    if target.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err("backup file must use the .json extension".into());
    }
    let metadata =
        fs::metadata(&target).map_err(|_| "failed to inspect backup file".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BACKUP_BYTES {
        return Err("backup file is too large".into());
    }
    let raw = fs::read_to_string(target).map_err(|_| "failed to read backup file".to_string())?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|_| "backup file is not valid JSON".to_string())
}

#[tauri::command]
fn create_automatic_backup(
    bundle: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config_dir = state
        .preferences_path
        .parent()
        .ok_or_else(|| "settings directory unavailable".to_string())?;
    let backup_dir = config_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|_| "failed to create backup directory".to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let target = backup_dir.join(format!("quota-float-{stamp}.json"));
    persist_json_value(&target, &bundle)?;

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
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn restore_latest_backup(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let config_dir = state
        .preferences_path
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
    let raw =
        fs::read_to_string(latest).map_err(|_| "failed to read automatic backup".to_string())?;
    serde_json::from_str(&raw).map_err(|_| "automatic backup is invalid".to_string())
}

#[tauri::command]
fn get_app_diagnostics(state: State<'_, AppState>) -> AppDiagnostics {
    let config_directory = state
        .preferences_path
        .parent()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    AppDiagnostics {
        app_version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        config_directory,
        preferences_backup_available: state.preferences_path.with_extension("json.bak").exists(),
        runtime_backup_available: state.runtime_state_path.with_extension("json.bak").exists(),
    }
}

#[tauri::command]
async fn get_snapshots(state: State<'_, AppState>) -> Result<Vec<ProviderSnapshot>, String> {
    const CACHE_TTL: Duration = Duration::from_secs(30);
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < CACHE_TTL {
                return Ok(apply_short_window_test_override(&state, values.clone()));
            }
        }
    }
    let _guard = match state.fetch_lock.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            if let Ok(cache) = state.snapshot_cache.lock() {
                if let Some((_, values)) = &*cache {
                    return Ok(apply_short_window_test_override(&state, values.clone()));
                }
            }
            return Ok(vec![ProviderSnapshot::failure(
                "unavailable",
                "Quota refresh is already running.",
            )]);
        }
    };
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < CACHE_TTL {
                return Ok(apply_short_window_test_override(&state, values.clone()));
            }
        }
    }
    let values = collect_snapshots(&state.client).await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    Ok(apply_short_window_test_override(&state, values))
}

#[tauri::command]
async fn refresh_snapshots(state: State<'_, AppState>) -> Result<Vec<ProviderSnapshot>, String> {
    Ok(fetch_snapshots_uncached(&state).await)
}

#[tauri::command]
async fn get_codex_reset_forecast(
    state: State<'_, AppState>,
) -> Result<Option<reset_forecast::ResetForecast>, String> {
    Ok(reset_forecast::fetch(&state.client).await)
}

#[tauri::command]
async fn get_codex_token_usage(
    force: bool,
    rebuild: bool,
    state: State<'_, AppState>,
) -> Result<codex_usage::CodexTokenUsageReport, String> {
    const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
    if !force && !rebuild {
        if let Ok(cache) = state.codex_usage_cache.lock() {
            if let Some((time, report)) = &*cache {
                if time.elapsed() < CACHE_TTL {
                    return Ok(report.clone());
                }
            }
        }
    }
    let _guard = state.codex_usage_fetch_lock.lock().await;
    if !force && !rebuild {
        if let Ok(cache) = state.codex_usage_cache.lock() {
            if let Some((time, report)) = &*cache {
                if time.elapsed() < CACHE_TTL {
                    return Ok(report.clone());
                }
            }
        }
    }
    let index_path = state.codex_usage_index_path.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        codex_usage::collect(90, &index_path, rebuild)
    })
    .await
    .map_err(|_| "Codex token metadata scan failed.".to_string())??;
    if let Ok(mut cache) = state.codex_usage_cache.lock() {
        *cache = Some((Instant::now(), report.clone()));
    }
    Ok(report)
}

#[tauri::command]
async fn get_volcengine_diagnostics() -> volcengine::VolcengineDiagnostics {
    volcengine::diagnostics().await
}

#[tauri::command]
async fn reconnect_volcengine(
    state: State<'_, AppState>,
) -> Result<volcengine::VolcengineDiagnostics, String> {
    let _guard = state.fetch_lock.lock().await;
    volcengine::reconnect().await?;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = None;
    }
    Ok(volcengine::diagnostics().await)
}

fn clamp_position_to_monitor(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left = monitor_position.x;
    let top = monitor_position.y;
    let right = left + monitor_size.width as i32;
    let bottom = top + monitor_size.height as i32;
    PhysicalPosition::new(
        position
            .x
            .clamp(left - safe_inset, right - size.width as i32 + safe_inset),
        position
            .y
            .clamp(top - safe_inset, bottom - size.height as i32 + safe_inset),
    )
}

fn logical_to_physical(value: f64, scale_factor: f64) -> u32 {
    (value * scale_factor).round().max(1.0) as u32
}

fn window_size_for_visual_size(visual_size: u32, safe_inset: u32) -> u32 {
    visual_size + safe_inset * 2
}

fn widget_window_size(logical_visual_size: f64, scale_factor: f64, safe_inset: u32) -> u32 {
    window_size_for_visual_size(
        logical_to_physical(logical_visual_size, scale_factor),
        safe_inset,
    )
}

fn bounded_expanded_height(
    content_height: f64,
    scale_factor: f64,
    safe_inset: u32,
    bounds_height: Option<u32>,
) -> u32 {
    let logical_height = if content_height.is_finite() {
        content_height.clamp(MIN_EXPANDED_LOGICAL_HEIGHT, MAX_EXPANDED_LOGICAL_HEIGHT)
    } else {
        EXPANDED_LOGICAL_HEIGHT
    };
    let requested = widget_window_size(logical_height, scale_factor, safe_inset);
    let Some(bounds_height) = bounds_height else {
        return requested;
    };
    let maximum = bounds_height.saturating_add(safe_inset.saturating_mul(2));
    let minimum =
        widget_window_size(MIN_EXPANDED_LOGICAL_HEIGHT, scale_factor, safe_inset).min(maximum);
    requested.min(maximum).max(minimum)
}

fn clamp_position_to_bounds(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let right = bounds_position.x + bounds_size.width as i32;
    let bottom = bounds_position.y + bounds_size.height as i32;
    let min_x = bounds_position.x - safe_inset;
    let min_y = bounds_position.y - safe_inset;
    let max_x = (right - size.width as i32 + safe_inset).max(min_x);
    let max_y = (bottom - size.height as i32 + safe_inset).max(min_y);
    PhysicalPosition::new(
        position.x.clamp(min_x, max_x),
        position.y.clamp(min_y, max_y),
    )
}

fn bar_dock(edge: BarEdge) -> DockState {
    match edge {
        BarEdge::Top => DockState {
            horizontal: None,
            vertical: Some(VerticalDock::Top),
        },
        BarEdge::Left => DockState {
            horizontal: Some(HorizontalDock::Left),
            vertical: None,
        },
        BarEdge::Right => DockState {
            horizontal: Some(HorizontalDock::Right),
            vertical: None,
        },
    }
}

fn bar_position_in_bounds(
    size: PhysicalSize<u32>,
    placement: BarPlacement,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let min_x = bounds_position.x - safe_inset;
    let min_y = bounds_position.y - safe_inset;
    let max_x =
        (bounds_position.x + bounds_size.width as i32 - size.width as i32 + safe_inset).max(min_x);
    let max_y = (bounds_position.y + bounds_size.height as i32 - size.height as i32 + safe_inset)
        .max(min_y);
    let interpolate = |minimum: i32, maximum: i32| {
        minimum + ((maximum - minimum) as f64 * placement.offset.clamp(0.0, 1.0)).round() as i32
    };
    match placement.edge {
        BarEdge::Top => PhysicalPosition::new(interpolate(min_x, max_x), min_y),
        BarEdge::Left => PhysicalPosition::new(min_x, interpolate(min_y, max_y)),
        BarEdge::Right => PhysicalPosition::new(max_x, interpolate(min_y, max_y)),
    }
}

fn bar_offset_from_rect(
    current: WidgetRect,
    target_size: PhysicalSize<u32>,
    edge: BarEdge,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> f64 {
    let (current_center, target_length, minimum, maximum) = match edge {
        BarEdge::Top => (
            current.position.x as f64 + current.size.width as f64 / 2.0,
            target_size.width,
            bounds_position.x - safe_inset,
            bounds_position.x + bounds_size.width as i32 - target_size.width as i32 + safe_inset,
        ),
        BarEdge::Left | BarEdge::Right => (
            current.position.y as f64 + current.size.height as f64 / 2.0,
            target_size.height,
            bounds_position.y - safe_inset,
            bounds_position.y + bounds_size.height as i32 - target_size.height as i32 + safe_inset,
        ),
    };
    let maximum = maximum.max(minimum);
    if maximum == minimum {
        return 0.5;
    }
    let desired = current_center - target_length as f64 / 2.0;
    ((desired - minimum as f64) / (maximum - minimum) as f64).clamp(0.0, 1.0)
}

fn magnetic_bar_edge(
    current: WidgetRect,
    current_edge: BarEdge,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    threshold: i32,
    safe_inset: i32,
) -> BarEdge {
    let visible_left = current.position.x + safe_inset;
    let visible_top = current.position.y + safe_inset;
    let visible_right = current.position.x + current.size.width as i32 - safe_inset;
    let bounds_right = bounds_position.x + bounds_size.width as i32;
    let distances = [
        (BarEdge::Top, (visible_top - bounds_position.y).abs()),
        (BarEdge::Left, (visible_left - bounds_position.x).abs()),
        (BarEdge::Right, (bounds_right - visible_right).abs()),
    ];
    let best = distances
        .iter()
        .filter_map(|(_, distance)| (*distance <= threshold).then_some(*distance))
        .min();
    let Some(best) = best else {
        return current_edge;
    };
    let mut nearest = distances
        .into_iter()
        .filter(|(_, distance)| *distance == best)
        .map(|(edge, _)| edge);
    let first = nearest.next().unwrap_or(current_edge);
    if nearest.next().is_some() {
        current_edge
    } else {
        first
    }
}

fn bar_collapsed_geometry(
    placement: BarPlacement,
    scale_factor: f64,
    safe_inset: u32,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
) -> (WidgetRect, DockState) {
    let size = collapsed_physical_size(CompactMode::Bar, placement.edge, scale_factor, safe_inset);
    (
        WidgetRect {
            position: bar_position_in_bounds(
                size,
                placement,
                bounds_position,
                bounds_size,
                safe_inset as i32,
            ),
            size,
        },
        bar_dock(placement.edge),
    )
}

fn bar_expanded_position_in_bounds(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    placement: BarPlacement,
    bounds: PhysicalBounds,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let min_x = bounds.position.x - safe_inset;
    let min_y = bounds.position.y - safe_inset;
    let max_x = (bounds.position.x + bounds.size.width as i32 - expanded_size.width as i32
        + safe_inset)
        .max(min_x);
    let max_y = (bounds.position.y + bounds.size.height as i32 - expanded_size.height as i32
        + safe_inset)
        .max(min_y);
    let centered_x =
        collapsed.position.x + collapsed.size.width as i32 / 2 - expanded_size.width as i32 / 2;
    let centered_y =
        collapsed.position.y + collapsed.size.height as i32 / 2 - expanded_size.height as i32 / 2;
    match placement.edge {
        BarEdge::Top => PhysicalPosition::new(centered_x.clamp(min_x, max_x), min_y),
        BarEdge::Left => PhysicalPosition::new(min_x, centered_y.clamp(min_y, max_y)),
        BarEdge::Right => PhysicalPosition::new(max_x, centered_y.clamp(min_y, max_y)),
    }
}

fn detect_dock(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    threshold: i32,
    safe_inset: i32,
) -> DockState {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let visible_left = position.x + safe_inset;
    let visible_top = position.y + safe_inset;
    let visible_right = position.x + size.width as i32 - safe_inset;
    let visible_bottom = position.y + size.height as i32 - safe_inset;
    let left_distance = (visible_left - monitor_position.x).abs();
    let top_distance = (visible_top - monitor_position.y).abs();
    let right_distance = (monitor_position.x + monitor_size.width as i32 - visible_right).abs();
    let bottom_distance = (monitor_position.y + monitor_size.height as i32 - visible_bottom).abs();
    let horizontal = if left_distance <= threshold || right_distance <= threshold {
        if left_distance <= right_distance {
            Some(HorizontalDock::Left)
        } else {
            Some(HorizontalDock::Right)
        }
    } else {
        None
    };
    let vertical = if top_distance <= threshold || bottom_distance <= threshold {
        if top_distance <= bottom_distance {
            Some(VerticalDock::Top)
        } else {
            Some(VerticalDock::Bottom)
        }
    } else {
        None
    };
    DockState {
        horizontal,
        vertical,
    }
}

fn snap_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    dock: DockState,
    monitor: &tauri::Monitor,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let mut next = clamp_position_to_monitor(position, size, monitor, safe_inset);
    match dock.horizontal {
        Some(HorizontalDock::Left) => next.x = monitor_position.x - safe_inset,
        Some(HorizontalDock::Right) => {
            next.x = monitor_position.x + monitor_size.width as i32 - size.width as i32 + safe_inset
        }
        None => {}
    }
    match dock.vertical {
        Some(VerticalDock::Top) => next.y = monitor_position.y - safe_inset,
        Some(VerticalDock::Bottom) => {
            next.y =
                monitor_position.y + monitor_size.height as i32 - size.height as i32 + safe_inset
        }
        None => {}
    }
    next
}

fn expanded_position_in_bounds(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    dock: DockState,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_right = bounds_position.x + bounds_size.width as i32;
    let monitor_bottom = bounds_position.y + bounds_size.height as i32;
    let collapsed_left = collapsed.position.x + safe_inset;
    let collapsed_top = collapsed.position.y + safe_inset;
    let collapsed_right = collapsed.position.x + collapsed.size.width as i32 - safe_inset;
    let collapsed_bottom = collapsed.position.y + collapsed.size.height as i32 - safe_inset;
    let x = match dock.horizontal {
        Some(HorizontalDock::Left) => collapsed_left - safe_inset,
        Some(HorizontalDock::Right) => collapsed_right - expanded_size.width as i32 + safe_inset,
        None if collapsed_left + expanded_size.width as i32 - safe_inset > monitor_right => {
            collapsed_right - expanded_size.width as i32 + safe_inset
        }
        None => collapsed_left - safe_inset,
    };
    let y = match dock.vertical {
        Some(VerticalDock::Top) => collapsed_top - safe_inset,
        Some(VerticalDock::Bottom) => collapsed_bottom - expanded_size.height as i32 + safe_inset,
        None if collapsed_top + expanded_size.height as i32 - safe_inset > monitor_bottom => {
            collapsed_bottom - expanded_size.height as i32 + safe_inset
        }
        None => collapsed_top - safe_inset,
    };
    let min_x = bounds_position.x - safe_inset;
    let min_y = bounds_position.y - safe_inset;
    let max_x = (monitor_right - expanded_size.width as i32 + safe_inset).max(min_x);
    let max_y = (monitor_bottom - expanded_size.height as i32 + safe_inset).max(min_y);
    PhysicalPosition::new(x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

fn expanded_position(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    dock: DockState,
    compact_mode: CompactMode,
    bar_placement: BarPlacement,
    bounds: PhysicalBounds,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    if compact_mode == CompactMode::Bar {
        return bar_expanded_position_in_bounds(
            collapsed,
            expanded_size,
            bar_placement,
            bounds,
            safe_inset,
        );
    }
    expanded_position_in_bounds(
        collapsed,
        expanded_size,
        dock,
        bounds.position,
        bounds.size,
        safe_inset,
    )
}

fn collapsed_geometry_for_expand(
    current_position: PhysicalPosition<i32>,
    collapsed_size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    threshold: i32,
    safe_inset: i32,
    previous: Option<WidgetGeometryState>,
) -> (WidgetRect, DockState) {
    if let Some(previous) = previous {
        let can_reuse_anchor = matches!(previous.mode, WidgetMode::Collapsed)
            || (matches!(previous.mode, WidgetMode::Expanded) && !previous.user_moved_expanded);
        if can_reuse_anchor {
            let position = if previous.dock.is_docked() {
                snap_position(
                    previous.collapsed_rect.position,
                    collapsed_size,
                    previous.dock,
                    monitor,
                    safe_inset,
                )
            } else {
                clamp_position_to_monitor(
                    previous.collapsed_rect.position,
                    collapsed_size,
                    monitor,
                    safe_inset,
                )
            };
            return (
                WidgetRect {
                    position,
                    size: collapsed_size,
                },
                previous.dock,
            );
        }
    }

    let current_collapsed = WidgetRect {
        position: clamp_position_to_monitor(current_position, collapsed_size, monitor, safe_inset),
        size: collapsed_size,
    };
    let dock = detect_dock(
        current_collapsed.position,
        collapsed_size,
        monitor,
        threshold,
        safe_inset,
    );
    let position = if dock.is_docked() {
        snap_position(
            current_collapsed.position,
            collapsed_size,
            dock,
            monitor,
            safe_inset,
        )
    } else {
        current_collapsed.position
    };
    (
        WidgetRect {
            position,
            size: collapsed_size,
        },
        dock,
    )
}

fn current_widget_rect(window: &tauri::WebviewWindow) -> Result<WidgetRect, String> {
    Ok(WidgetRect {
        position: window
            .outer_position()
            .map_err(|_| "failed to read widget position".to_string())?,
        size: window
            .outer_size()
            .map_err(|_| "failed to read widget size".to_string())?,
    })
}

fn monitor_and_scale(
    window: &tauri::WebviewWindow,
) -> Result<(Option<tauri::Monitor>, f64), String> {
    let monitor = window
        .current_monitor()
        .map_err(|_| "failed to read monitor".to_string())?;
    let scale_factor = monitor
        .as_ref()
        .map(|item| item.scale_factor())
        .unwrap_or(1.0);
    Ok((monitor, scale_factor))
}

fn infer_mode(rect: WidgetRect, collapsed_size: PhysicalSize<u32>) -> WidgetMode {
    if rect.size.width <= collapsed_size.width + POSITION_EPSILON
        && rect.size.height <= collapsed_size.height + POSITION_EPSILON
    {
        WidgetMode::Collapsed
    } else {
        WidgetMode::Expanded
    }
}

fn infer_compact_mode(rect: WidgetRect) -> CompactMode {
    if rect.size.width > rect.size.height.saturating_mul(3)
        || rect.size.height > rect.size.width.saturating_mul(3)
    {
        CompactMode::Bar
    } else {
        CompactMode::Float
    }
}

#[tauri::command]
fn expand_widget(
    work_area: Option<WorkAreaPayload>,
    compact_layout: Option<String>,
    bar_edge: Option<String>,
    bar_offset: Option<f64>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let compact_mode = compact_mode(compact_layout.as_deref());
    let bar_placement = bar_placement(bar_edge.as_deref(), bar_offset);
    let collapsed_size =
        collapsed_physical_size(compact_mode, bar_placement.edge, scale_factor, safe_inset);
    let expanded_size = PhysicalSize::new(
        widget_window_size(EXPANDED_LOGICAL_WIDTH, scale_factor, safe_inset),
        widget_window_size(EXPANDED_LOGICAL_HEIGHT, scale_factor, safe_inset),
    );
    let Some(monitor) = monitor else {
        window
            .set_size(expanded_size)
            .map_err(|_| "failed to resize widget".to_string())?;
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let previous = state.geometry.lock().ok().and_then(|value| *value);
    let bounds = work_area
        .map(|area| PhysicalBounds {
            position: PhysicalPosition::new(area.position.x, area.position.y),
            size: PhysicalSize::new(area.size.width, area.size.height),
        })
        .unwrap_or(PhysicalBounds {
            position: *monitor.position(),
            size: *monitor.size(),
        });
    let (collapsed_rect, dock) = if compact_mode == CompactMode::Bar {
        bar_collapsed_geometry(
            bar_placement,
            scale_factor,
            safe_inset,
            bounds.position,
            bounds.size,
        )
    } else {
        collapsed_geometry_for_expand(
            current.position,
            collapsed_size,
            &monitor,
            threshold,
            safe_inset as i32,
            previous.filter(|value| value.compact_mode == compact_mode),
        )
    };
    let expanded_rect = WidgetRect {
        position: expanded_position(
            collapsed_rect,
            expanded_size,
            dock,
            compact_mode,
            bar_placement,
            bounds,
            safe_inset as i32,
        ),
        size: expanded_size,
    };

    if let Ok(mut geometry) = state.geometry.lock() {
        *geometry = Some(WidgetGeometryState {
            mode: WidgetMode::Expanded,
            compact_mode,
            bar_placement,
            dock,
            collapsed_rect,
            expanded_rect: Some(expanded_rect),
            user_moved_expanded: false,
        });
    }

    window
        .set_position(expanded_rect.position)
        .map_err(|_| "failed to position widget".to_string())?;
    window
        .set_size(expanded_size)
        .map_err(|_| "failed to resize widget".to_string())
}

#[tauri::command]
fn resize_expanded_widget(
    content_height: f64,
    work_area: Option<WorkAreaPayload>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let expanded_width = widget_window_size(EXPANDED_LOGICAL_WIDTH, scale_factor, safe_inset);
    let bounds = work_area.map(|area| PhysicalBounds {
        position: PhysicalPosition::new(area.position.x, area.position.y),
        size: PhysicalSize::new(area.size.width, area.size.height),
    });
    let fallback_bounds = monitor.as_ref().map(|item| PhysicalBounds {
        position: *item.position(),
        size: *item.size(),
    });
    let active_bounds = bounds.or(fallback_bounds);
    let expanded_height = bounded_expanded_height(
        content_height,
        scale_factor,
        safe_inset,
        active_bounds.map(|bounds| bounds.size.height),
    );
    let expanded_size = PhysicalSize::new(expanded_width, expanded_height);
    let previous = state.geometry.lock().ok().and_then(|value| *value);

    let next_position = match (previous, active_bounds) {
        (Some(geometry), Some(bounds)) if geometry.user_moved_expanded => clamp_position_to_bounds(
            current.position,
            expanded_size,
            bounds.position,
            bounds.size,
            safe_inset as i32,
        ),
        (Some(geometry), Some(bounds)) => expanded_position(
            geometry.collapsed_rect,
            expanded_size,
            geometry.dock,
            geometry.compact_mode,
            geometry.bar_placement,
            bounds,
            safe_inset as i32,
        ),
        (_, Some(bounds)) => clamp_position_to_bounds(
            current.position,
            expanded_size,
            bounds.position,
            bounds.size,
            safe_inset as i32,
        ),
        (_, None) => current.position,
    };

    window
        .set_position(next_position)
        .map_err(|_| "failed to position widget".to_string())?;
    window
        .set_size(expanded_size)
        .map_err(|_| "failed to resize widget".to_string())?;

    if let (Ok(mut value), Some(mut geometry)) = (state.geometry.lock(), previous) {
        geometry.mode = WidgetMode::Expanded;
        geometry.expanded_rect = Some(WidgetRect {
            position: next_position,
            size: expanded_size,
        });
        *value = Some(geometry);
    }
    Ok(())
}

#[cfg(test)]
mod persistence_tests {
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
        assert_eq!(read_json_with_backup(&runtime_path), runtime);
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
}

#[cfg(test)]
mod geometry_tests {
    use super::*;

    fn rect(x: i32, y: i32, size: u32) -> WidgetRect {
        WidgetRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(size, size),
        }
    }

    #[test]
    fn window_size_includes_the_transparent_safe_inset() {
        assert_eq!(window_size_for_visual_size(80, 4), 88);
        assert_eq!(widget_window_size(320.0, 1.5, 6), 492);
    }

    #[test]
    fn compact_modes_use_distinct_window_sizes() {
        assert_eq!(
            collapsed_physical_size(CompactMode::Float, BarEdge::Top, 1.0, 4),
            PhysicalSize::new(100, 100)
        );
        assert_eq!(
            collapsed_physical_size(CompactMode::Bar, BarEdge::Top, 1.0, 4),
            PhysicalSize::new(408, 46)
        );
        assert_eq!(
            collapsed_physical_size(CompactMode::Bar, BarEdge::Left, 1.0, 4),
            PhysicalSize::new(72, 328)
        );
        assert_eq!(
            collapsed_physical_size(CompactMode::Bar, BarEdge::Top, 1.25, 5),
            PhysicalSize::new(510, 58)
        );
        assert_eq!(
            collapsed_physical_size(CompactMode::Bar, BarEdge::Right, 1.5, 6),
            PhysicalSize::new(108, 492)
        );
        assert_eq!(
            infer_compact_mode(WidgetRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(408, 46),
            }),
            CompactMode::Bar
        );
        assert_eq!(
            infer_compact_mode(WidgetRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(72, 328),
            }),
            CompactMode::Bar
        );
    }

    #[test]
    fn bar_positions_cover_three_edges_and_normalized_offsets() {
        let bounds_position = PhysicalPosition::new(-1280, 40);
        let bounds_size = PhysicalSize::new(1280, 960);
        let top_size = PhysicalSize::new(408, 46);
        let side_size = PhysicalSize::new(72, 328);
        for (offset, expected_x) in [(0.0, -1284), (0.5, -844), (1.0, -404)] {
            assert_eq!(
                bar_position_in_bounds(
                    top_size,
                    BarPlacement {
                        edge: BarEdge::Top,
                        offset,
                    },
                    bounds_position,
                    bounds_size,
                    4,
                ),
                PhysicalPosition::new(expected_x, 36)
            );
        }
        for (offset, expected_y) in [(0.0, 36), (0.5, 356), (1.0, 676)] {
            assert_eq!(
                bar_position_in_bounds(
                    side_size,
                    BarPlacement {
                        edge: BarEdge::Left,
                        offset,
                    },
                    bounds_position,
                    bounds_size,
                    4,
                ),
                PhysicalPosition::new(-1284, expected_y)
            );
            assert_eq!(
                bar_position_in_bounds(
                    side_size,
                    BarPlacement {
                        edge: BarEdge::Right,
                        offset,
                    },
                    bounds_position,
                    bounds_size,
                    4,
                ),
                PhysicalPosition::new(-68, expected_y)
            );
        }
    }

    #[test]
    fn bar_offset_projects_the_drag_center_across_orientation_changes() {
        let top_rect = WidgetRect {
            position: PhysicalPosition::new(500, 337),
            size: PhysicalSize::new(408, 46),
        };
        let side_offset = bar_offset_from_rect(
            top_rect,
            PhysicalSize::new(72, 328),
            BarEdge::Left,
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert!((side_offset - 0.277_777_777_8).abs() < 0.000_001);

        let side_rect = WidgetRect {
            position: PhysicalPosition::new(400, 300),
            size: PhysicalSize::new(72, 328),
        };
        let top_offset = bar_offset_from_rect(
            side_rect,
            PhysicalSize::new(408, 46),
            BarEdge::Top,
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert!((top_offset - 0.155_263_157_9).abs() < 0.000_001);
    }

    #[test]
    fn bar_expansion_and_content_resize_preserve_the_collapsed_anchor() {
        let bounds = PhysicalBounds {
            position: PhysicalPosition::new(0, 0),
            size: PhysicalSize::new(1920, 1040),
        };
        let placement = BarPlacement {
            edge: BarEdge::Left,
            offset: 0.25,
        };
        let (collapsed, _) =
            bar_collapsed_geometry(placement, 1.0, 4, bounds.position, bounds.size);
        let compact_dashboard = PhysicalSize::new(568, 280);
        let tall_dashboard = PhysicalSize::new(568, 600);
        let compact_position =
            bar_expanded_position_in_bounds(collapsed, compact_dashboard, placement, bounds, 4);
        let tall_position =
            bar_expanded_position_in_bounds(collapsed, tall_dashboard, placement, bounds, 4);

        let collapsed_center = collapsed.position.y + collapsed.size.height as i32 / 2;
        assert_eq!(compact_position, PhysicalPosition::new(-4, 200));
        assert_eq!(tall_position, PhysicalPosition::new(-4, 40));
        assert_eq!(
            compact_position.y + compact_dashboard.height as i32 / 2,
            collapsed_center
        );
        assert_eq!(
            tall_position.y + tall_dashboard.height as i32 / 2,
            collapsed_center
        );
    }

    #[test]
    fn magnetic_bar_edges_switch_near_targets_and_keep_current_on_ties() {
        let bounds_position = PhysicalPosition::new(0, 0);
        let bounds_size = PhysicalSize::new(1920, 1040);
        let near_left = WidgetRect {
            position: PhysicalPosition::new(-2, 320),
            size: PhysicalSize::new(408, 46),
        };
        assert_eq!(
            magnetic_bar_edge(near_left, BarEdge::Top, bounds_position, bounds_size, 24, 4),
            BarEdge::Left
        );

        let top_left_tie = WidgetRect {
            position: PhysicalPosition::new(-4, -4),
            size: PhysicalSize::new(408, 46),
        };
        assert_eq!(
            magnetic_bar_edge(
                top_left_tie,
                BarEdge::Top,
                bounds_position,
                bounds_size,
                24,
                4
            ),
            BarEdge::Top
        );
        assert_eq!(
            magnetic_bar_edge(
                top_left_tie,
                BarEdge::Right,
                bounds_position,
                bounds_size,
                24,
                4
            ),
            BarEdge::Right
        );

        let bottom_center = WidgetRect {
            position: PhysicalPosition::new(900, 990),
            size: PhysicalSize::new(72, 328),
        };
        assert_eq!(
            magnetic_bar_edge(
                bottom_center,
                BarEdge::Right,
                bounds_position,
                bounds_size,
                24,
                4
            ),
            BarEdge::Right
        );
    }

    #[test]
    fn expanded_height_tracks_content_and_respects_work_area() {
        assert_eq!(bounded_expanded_height(313.4, 1.0, 4, Some(1040)), 321);
        assert_eq!(bounded_expanded_height(40.0, 1.0, 4, Some(1040)), 268);
        assert_eq!(bounded_expanded_height(2_000.0, 1.0, 4, Some(700)), 708);
        assert_eq!(bounded_expanded_height(2_000.0, 1.0, 4, Some(1400)), 1200);
    }

    #[test]
    fn invalid_expanded_height_falls_back_to_the_default() {
        assert_eq!(bounded_expanded_height(f64::NAN, 1.0, 4, Some(1040)), 268);
    }

    #[test]
    fn expansion_stays_above_a_bottom_taskbar() {
        let position = expanded_position_in_bounds(
            rect(1812, 952, 88),
            PhysicalSize::new(328, 328),
            DockState {
                horizontal: Some(HorizontalDock::Right),
                vertical: Some(VerticalDock::Bottom),
            },
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(1572, 712));
    }

    #[test]
    fn expansion_handles_negative_origin_work_areas() {
        let position = expanded_position_in_bounds(
            rect(-1284, -4, 88),
            PhysicalSize::new(328, 328),
            DockState {
                horizontal: Some(HorizontalDock::Left),
                vertical: Some(VerticalDock::Top),
            },
            PhysicalPosition::new(-1280, 0),
            PhysicalSize::new(1280, 984),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(-1284, -4));
    }

    #[test]
    fn undocked_expansion_flips_inward_near_work_area_edges() {
        let position = expanded_position_in_bounds(
            rect(1750, 900, 88),
            PhysicalSize::new(328, 328),
            DockState::default(),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(1510, 660));
    }
}

#[tauri::command]
fn collapse_widget(
    work_area: Option<WorkAreaPayload>,
    compact_layout: Option<String>,
    bar_edge: Option<String>,
    bar_offset: Option<f64>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let compact_mode = compact_mode(compact_layout.as_deref());
    let bar_placement = bar_placement(bar_edge.as_deref(), bar_offset);
    let collapsed_size =
        collapsed_physical_size(compact_mode, bar_placement.edge, scale_factor, safe_inset);
    let Some(monitor) = monitor else {
        window
            .set_size(collapsed_size)
            .map_err(|_| "failed to resize widget".to_string())?;
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let previous = state.geometry.lock().ok().and_then(|value| *value);
    let (bounds_position, bounds_size) = work_area
        .map(|area| {
            (
                PhysicalPosition::new(area.position.x, area.position.y),
                PhysicalSize::new(area.size.width, area.size.height),
            )
        })
        .unwrap_or_else(|| (*monitor.position(), *monitor.size()));
    let (collapsed_rect, dock) = if compact_mode == CompactMode::Bar {
        bar_collapsed_geometry(
            bar_placement,
            scale_factor,
            safe_inset,
            bounds_position,
            bounds_size,
        )
    } else {
        let compatible_previous = previous.filter(|value| value.compact_mode == compact_mode);
        let user_moved_expanded = compatible_previous
            .map(|value| value.user_moved_expanded)
            .unwrap_or(false);
        let candidate = if user_moved_expanded {
            current.position
        } else {
            compatible_previous
                .map(|value| value.collapsed_rect.position)
                .unwrap_or(current.position)
        };
        let dock = detect_dock(
            candidate,
            collapsed_size,
            &monitor,
            threshold,
            safe_inset as i32,
        );
        let next_position = if dock.is_docked() {
            snap_position(candidate, collapsed_size, dock, &monitor, safe_inset as i32)
        } else {
            clamp_position_to_monitor(candidate, collapsed_size, &monitor, safe_inset as i32)
        };
        (
            WidgetRect {
                position: next_position,
                size: collapsed_size,
            },
            dock,
        )
    };
    if let Ok(mut geometry) = state.geometry.lock() {
        *geometry = Some(WidgetGeometryState {
            mode: WidgetMode::Collapsed,
            compact_mode,
            bar_placement,
            dock,
            collapsed_rect,
            expanded_rect: None,
            user_moved_expanded: false,
        });
    }
    window
        .set_size(collapsed_size)
        .map_err(|_| "failed to resize widget".to_string())?;
    window
        .set_position(collapsed_rect.position)
        .map_err(|_| "failed to position widget".to_string())
}

#[tauri::command]
fn begin_widget_drag(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (_, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let geometry = state.geometry.lock().ok().and_then(|value| *value);
    let compact_mode = geometry
        .map(|value| value.compact_mode)
        .unwrap_or_else(|| infer_compact_mode(current));
    let placement = geometry
        .map(|value| value.bar_placement)
        .unwrap_or_default();
    let collapsed_size =
        collapsed_physical_size(compact_mode, placement.edge, scale_factor, safe_inset);
    let mode = geometry
        .map(|value| value.mode)
        .unwrap_or_else(|| infer_mode(current, collapsed_size));
    if let Ok(mut drag_mode) = state.drag_mode.lock() {
        *drag_mode = Some(mode);
    }
    Ok(())
}

#[tauri::command]
fn finish_widget_drag(
    work_area: Option<WorkAreaPayload>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<BarPlacement>, String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let Some(monitor) = monitor else {
        return Ok(None);
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let previous_geometry = state.geometry.lock().ok().and_then(|value| *value);
    let compact_mode = previous_geometry
        .map(|value| value.compact_mode)
        .unwrap_or_else(|| infer_compact_mode(current));
    let previous_placement = previous_geometry
        .map(|value| value.bar_placement)
        .unwrap_or_default();
    let collapsed_size = collapsed_physical_size(
        compact_mode,
        previous_placement.edge,
        scale_factor,
        safe_inset,
    );
    let (bounds_position, bounds_size) = work_area
        .map(|area| {
            (
                PhysicalPosition::new(area.position.x, area.position.y),
                PhysicalSize::new(area.size.width, area.size.height),
            )
        })
        .unwrap_or_else(|| (*monitor.position(), *monitor.size()));
    let mode = state
        .drag_mode
        .lock()
        .ok()
        .and_then(|mut value| value.take())
        .or_else(|| previous_geometry.map(|value| value.mode))
        .unwrap_or_else(|| infer_mode(current, collapsed_size));

    let resolved_placement = match mode {
        WidgetMode::Collapsed => {
            let (collapsed_rect, dock, placement) = if compact_mode == CompactMode::Bar {
                let edge = magnetic_bar_edge(
                    current,
                    previous_placement.edge,
                    bounds_position,
                    bounds_size,
                    threshold,
                    safe_inset as i32,
                );
                let target_size =
                    collapsed_physical_size(CompactMode::Bar, edge, scale_factor, safe_inset);
                let placement = BarPlacement {
                    edge,
                    offset: bar_offset_from_rect(
                        current,
                        target_size,
                        edge,
                        bounds_position,
                        bounds_size,
                        safe_inset as i32,
                    ),
                };
                let (rect, dock) = bar_collapsed_geometry(
                    placement,
                    scale_factor,
                    safe_inset,
                    bounds_position,
                    bounds_size,
                );
                (rect, dock, Some(placement))
            } else {
                let dock = detect_dock(
                    current.position,
                    collapsed_size,
                    &monitor,
                    threshold,
                    safe_inset as i32,
                );
                let position = if dock.is_docked() {
                    snap_position(
                        current.position,
                        collapsed_size,
                        dock,
                        &monitor,
                        safe_inset as i32,
                    )
                } else {
                    clamp_position_to_monitor(
                        current.position,
                        collapsed_size,
                        &monitor,
                        safe_inset as i32,
                    )
                };
                (
                    WidgetRect {
                        position,
                        size: collapsed_size,
                    },
                    dock,
                    None,
                )
            };
            window
                .set_size(collapsed_rect.size)
                .map_err(|_| "failed to resize widget".to_string())?;
            window
                .set_position(collapsed_rect.position)
                .map_err(|_| "failed to position widget".to_string())?;
            if let Ok(mut geometry) = state.geometry.lock() {
                *geometry = Some(WidgetGeometryState {
                    mode: WidgetMode::Collapsed,
                    compact_mode,
                    bar_placement: placement.unwrap_or(previous_placement),
                    dock,
                    collapsed_rect,
                    expanded_rect: None,
                    user_moved_expanded: false,
                });
            }
            placement
        }
        WidgetMode::Expanded => {
            let current_position = clamp_position_to_bounds(
                current.position,
                current.size,
                bounds_position,
                bounds_size,
                safe_inset as i32,
            );
            let updated_rect = WidgetRect {
                position: current_position,
                size: current.size,
            };
            window
                .set_position(current_position)
                .map_err(|_| "failed to position widget".to_string())?;
            if let Ok(mut geometry) = state.geometry.lock() {
                if let Some(mut value) = *geometry {
                    value.mode = WidgetMode::Expanded;
                    value.expanded_rect = Some(updated_rect);
                    value.user_moved_expanded = true;
                    *geometry = Some(value);
                }
            }
            None
        }
    };
    Ok(resolved_placement)
}

#[tauri::command]
fn get_preferences(state: State<'_, AppState>) -> Result<WidgetPreferences, String> {
    state
        .preferences
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "settings unavailable".into())
}

#[tauri::command]
fn set_preferences(
    preferences: WidgetPreferences,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let preferences = preferences.normalized();
    persist_preferences(&state.preferences_path, &preferences)?;
    *state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())? = preferences;
    Ok(())
}

#[tauri::command]
fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("failed to read autostart state: {error}"))
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool, app: AppHandle) -> Result<bool, String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| format!("failed to update autostart state: {error}"))?;
    manager
        .is_enabled()
        .map_err(|error| format!("failed to confirm autostart state: {error}"))
}

fn apply_lock(app: &AppHandle, locked: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    window
        .set_ignore_cursor_events(locked)
        .map_err(|_| "failed to toggle click-through".to_string())
}

#[tauri::command]
fn set_widget_locked(
    locked: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WidgetPreferences, String> {
    let previous = state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())?
        .clone();
    let mut next = previous.clone();
    next.locked = locked;
    persist_preferences(&state.preferences_path, &next)?;
    if let Err(error) = apply_lock(&app, locked) {
        let _ = persist_preferences(&state.preferences_path, &previous);
        return Err(error);
    }
    *state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())? = next.clone();
    Ok(next)
}

#[tauri::command]
fn set_widget_always_on_top(
    always_on_top: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WidgetPreferences, String> {
    let previous = state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())?
        .clone();
    let mut next = previous.clone();
    next.always_on_top = always_on_top;
    persist_preferences(&state.preferences_path, &next)?;
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    if let Err(error) = window.set_always_on_top(always_on_top) {
        let _ = persist_preferences(&state.preferences_path, &previous);
        return Err(format!("failed to toggle always-on-top: {error}"));
    }
    *state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())? = next.clone();
    let _ = app.emit_to("widget", "preferences-changed", next.clone());
    Ok(next)
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Check for updates", true, None::<&str>)?;
    let unlock = MenuItem::with_id(app, "unlock", "Unlock widget", true, None::<&str>)?;
    let pin = MenuItem::with_id(app, "pin", "Pin / Unpin Codex", true, None::<&str>)?;
    let language = MenuItem::with_id(
        app,
        "language",
        "Switch Language / 切换语言",
        true,
        None::<&str>,
    )?;
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start at login",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    #[cfg(debug_assertions)]
    let test_short_window = CheckMenuItem::with_id(
        app,
        "debug-short-window",
        "Test: simulate 5-hour quota",
        true,
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let initial_language = app
        .try_state::<AppState>()
        .and_then(|state| {
            state
                .preferences
                .lock()
                .ok()
                .map(|prefs| prefs.language.clone())
        })
        .unwrap_or_else(|| "zh-CN".into());
    if initial_language != "en" {
        let _ = show.set_text("显示 / 隐藏");
        let _ = refresh.set_text("立即刷新");
        let _ = update.set_text("检查更新");
        let _ = unlock.set_text("解锁悬浮窗");
        let _ = pin.set_text("固定 / 取消固定 Codex");
        let _ = language.set_text("Switch to English");
        let _ = autostart.set_text("开机启动");
        let _ = quit.set_text("退出");
    }
    #[cfg(debug_assertions)]
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &refresh,
            &update,
            &unlock,
            &pin,
            &language,
            &autostart,
            &test_short_window,
            &quit,
        ],
    )?;
    #[cfg(not(debug_assertions))]
    let menu = Menu::with_items(
        app,
        &[
            &show, &refresh, &update, &unlock, &pin, &language, &autostart, &quit,
        ],
    )?;
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Quota Float");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let autostart_menu = autostart.clone();
    let show_menu = show.clone();
    let refresh_menu = refresh.clone();
    let update_menu = update.clone();
    let unlock_menu = unlock.clone();
    let pin_menu = pin.clone();
    let language_menu = language.clone();
    let quit_menu = quit.clone();
    #[cfg(debug_assertions)]
    let test_short_window_menu = test_short_window.clone();
    builder
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("widget") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            "refresh" => {
                let _ = app.emit_to("widget", "refresh-requested", ());
            }
            "update" => {
                let _ = app.emit_to("widget", "update-check-requested", ());
            }
            "debug-short-window" =>
            {
                #[cfg(debug_assertions)]
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut enabled) = state.simulate_short_window_for_testing.lock() {
                        *enabled = !*enabled;
                        let _ = test_short_window_menu.set_checked(*enabled);
                        let _ = app.emit_to("widget", "refresh-requested", ());
                    }
                }
            }
            "unlock" => {
                let _ = apply_lock(app, false);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.locked = false;
                        let _ = persist_preferences(&state.preferences_path, &prefs);
                        let _ = app.emit_to("widget", "preferences-changed", prefs.clone());
                    }
                }
            }
            "pin" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.pinned_provider = if prefs.pinned_provider.is_some() {
                            None
                        } else {
                            Some("codex".into())
                        };
                        let _ = persist_preferences(&state.preferences_path, &prefs);
                        let _ = app.emit_to("widget", "preferences-changed", prefs.clone());
                    }
                }
            }
            "language" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.language = if prefs.language == "en" {
                            "zh-CN".into()
                        } else {
                            "en".into()
                        };
                        let normalized = prefs.clone().normalized();
                        *prefs = normalized.clone();
                        let _ = persist_preferences(&state.preferences_path, &normalized);
                        let english = normalized.language == "en";
                        let _ = show_menu.set_text(if english {
                            "Show / Hide"
                        } else {
                            "显示 / 隐藏"
                        });
                        let _ = refresh_menu.set_text(if english {
                            "Refresh now"
                        } else {
                            "立即刷新"
                        });
                        let _ = update_menu.set_text(if english {
                            "Check for updates"
                        } else {
                            "检查更新"
                        });
                        let _ = unlock_menu.set_text(if english {
                            "Unlock widget"
                        } else {
                            "解锁悬浮窗"
                        });
                        let _ = pin_menu.set_text(if english {
                            "Pin / Unpin Codex"
                        } else {
                            "固定 / 取消固定 Codex"
                        });
                        let _ = language_menu.set_text(if english {
                            "切换到中文"
                        } else {
                            "Switch to English"
                        });
                        let _ = autostart_menu.set_text(if english {
                            "Start at login"
                        } else {
                            "开机启动"
                        });
                        let _ = quit_menu.set_text(if english { "Quit" } else { "退出" });
                        let _ = app.emit_to("widget", "preferences-changed", normalized);
                    }
                }
            }
            "autostart" => {
                let manager = app.autolaunch();
                let enabled = manager.is_enabled().unwrap_or(false);
                let result = if enabled {
                    manager.disable()
                } else {
                    manager.enable()
                };
                match result {
                    Ok(()) => {
                        let _ = autostart_menu.set_checked(!enabled);
                    }
                    Err(_) => eprintln!("autostart update failed"),
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("widget") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(WindowStateBuilder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_config_dir()?;
            let preferences_path = data_dir.join("preferences.json");
            let runtime_state_path = data_dir.join("runtime-state.json");
            let codex_usage_index_path = data_dir.join("codex-usage-index.json");
            let preferences = load_preferences(&preferences_path);
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(12))
                .redirect(reqwest::redirect::Policy::none())
                .user_agent(concat!("QuotaFloat/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("static HTTP client configuration must be valid");
            app.manage(AppState {
                client,
                preferences: Mutex::new(preferences.clone()),
                preferences_path,
                runtime_state_path,
                fetch_lock: tokio::sync::Mutex::new(()),
                snapshot_cache: Mutex::new(None),
                codex_usage_fetch_lock: tokio::sync::Mutex::new(()),
                codex_usage_cache: Mutex::new(None),
                codex_usage_index_path,
                #[cfg(debug_assertions)]
                simulate_short_window_for_testing: Mutex::new(false),
                geometry: Mutex::new(None),
                drag_mode: Mutex::new(None),
            });
            if setup_tray(app).is_err() {
                eprintln!("tray setup failed; enabling taskbar fallback");
                if let Some(window) = app.get_webview_window("widget") {
                    let _ = window.set_skip_taskbar(false);
                }
            }
            if preferences.locked {
                let _ = apply_lock(app.handle(), true);
            }
            if let Some(window) = app.get_webview_window("widget") {
                let _ = window.set_always_on_top(preferences.always_on_top);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshots,
            refresh_snapshots,
            get_codex_reset_forecast,
            get_codex_token_usage,
            get_volcengine_diagnostics,
            reconnect_volcengine,
            expand_widget,
            resize_expanded_widget,
            collapse_widget,
            begin_widget_drag,
            finish_widget_drag,
            get_preferences,
            set_preferences,
            get_autostart_enabled,
            set_autostart_enabled,
            set_widget_locked,
            set_widget_always_on_top,
            get_runtime_state,
            set_runtime_state,
            apply_app_data,
            export_app_data,
            export_usage_data,
            import_app_data,
            create_automatic_backup,
            restore_latest_backup,
            get_app_diagnostics
        ])
        .on_tray_icon_event(|app, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("widget") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Quota Float");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Resumed) {
            let _ = app_handle.emit_to("widget", "refresh-requested", ());
        }
    });
}
