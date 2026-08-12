mod antigravity;
mod codex;
mod models;
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
use tauri_plugin_window_state::Builder as WindowStateBuilder;

const COLLAPSED_LOGICAL_WIDTH: f64 = 92.0;
const COLLAPSED_LOGICAL_HEIGHT: f64 = 92.0;
const ISLAND_LOGICAL_WIDTH: f64 = 400.0;
const ISLAND_LOGICAL_HEIGHT: f64 = 38.0;
const EXPANDED_LOGICAL_WIDTH: f64 = 552.0;
// The React card reports its intrinsic height immediately after expansion.
// Keep the initial shell compact so the content-driven resize does not visibly jump down.
const EXPANDED_LOGICAL_HEIGHT: f64 = 260.0;
const MIN_EXPANDED_LOGICAL_HEIGHT: f64 = 160.0;
const MAX_EXPANDED_LOGICAL_HEIGHT: f64 = 1_200.0;
const EDGE_SAFE_INSET_LOGICAL: f64 = 4.0;
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
    Island,
}

#[derive(Clone, Copy)]
struct WidgetGeometryState {
    mode: WidgetMode,
    compact_mode: CompactMode,
    dock: DockState,
    collapsed_rect: WidgetRect,
    expanded_rect: Option<WidgetRect>,
    user_moved_expanded: bool,
}

fn compact_mode(compact_layout: Option<&str>) -> CompactMode {
    if matches!(compact_layout, Some("bar" | "island")) {
        CompactMode::Island
    } else {
        CompactMode::Float
    }
}

fn collapsed_physical_size(
    compact_mode: CompactMode,
    scale_factor: f64,
    safe_inset: u32,
) -> PhysicalSize<u32> {
    let (width, height) = match compact_mode {
        CompactMode::Float => (COLLAPSED_LOGICAL_WIDTH, COLLAPSED_LOGICAL_HEIGHT),
        CompactMode::Island => (ISLAND_LOGICAL_WIDTH, ISLAND_LOGICAL_HEIGHT),
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

async fn collect_snapshots_once(client: &reqwest::Client) -> Vec<ProviderSnapshot> {
    let qoder_snapshot = qoder::fetch_snapshot();
    let (
        codex_snapshot,
        trae_snapshot,
        workbuddy_snapshot,
        volcengine_snapshot,
        antigravity_snapshot,
    ) = tokio::join!(
        codex::fetch_snapshot(client),
        trae::fetch_snapshot(client),
        workbuddy::fetch_snapshot(client),
        volcengine::fetch_snapshot(),
        antigravity::fetch_snapshot(),
    );
    let mut values = vec![codex_snapshot];
    values.extend(qoder_snapshot);
    values.extend(trae_snapshot);
    values.extend(workbuddy_snapshot);
    values.extend(volcengine_snapshot);
    values.extend(antigravity_snapshot);
    values
}

async fn collect_snapshots(client: &reqwest::Client) -> Vec<ProviderSnapshot> {
    let mut values = collect_snapshots_once(client).await;
    for delay in [400_u64, 1_200_u64] {
        let retryable = values.iter().any(|snapshot| {
            matches!(
                snapshot.status.as_str(),
                "unavailable" | "stale" | "loading"
            )
        });
        if !retryable {
            break;
        }
        tokio::time::sleep(Duration::from_millis(delay)).await;
        let retried = collect_snapshots_once(client).await;
        for current in &mut values {
            if !matches!(current.status.as_str(), "unavailable" | "stale" | "loading") {
                continue;
            }
            if let Some(candidate) = retried
                .iter()
                .find(|candidate| candidate.provider == current.provider)
            {
                *current = candidate.clone();
            }
        }
    }
    values
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
                "schemaVersion": 1,
                "history": [],
                "dailyUsage": [],
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
fn export_app_data(path: String, bundle: serde_json::Value) -> Result<(), String> {
    let target = PathBuf::from(path);
    if target.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err("backup file must use the .json extension".into());
    }
    persist_json_value(&target, &bundle)
}

#[tauri::command]
fn import_app_data(path: String) -> Result<serde_json::Value, String> {
    let target = PathBuf::from(path);
    let raw = fs::read_to_string(target).map_err(|_| "failed to read backup file".to_string())?;
    serde_json::from_str(&raw).map_err(|_| "backup file is not valid JSON".to_string())
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
    monitor: &tauri::Monitor,
    work_area: Option<WorkAreaPayload>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let (bounds_position, bounds_size) = work_area
        .map(|area| {
            (
                PhysicalPosition::new(area.position.x, area.position.y),
                PhysicalSize::new(area.size.width, area.size.height),
            )
        })
        .unwrap_or_else(|| (*monitor.position(), *monitor.size()));
    if compact_mode == CompactMode::Island {
        return island_expanded_position_in_bounds(
            collapsed,
            expanded_size,
            bounds_position,
            bounds_size,
            safe_inset,
        );
    }
    expanded_position_in_bounds(
        collapsed,
        expanded_size,
        dock,
        bounds_position,
        bounds_size,
        safe_inset,
    )
}

fn island_expanded_position_in_bounds(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let centered = PhysicalPosition::new(
        collapsed.position.x + (collapsed.size.width as i32 - expanded_size.width as i32) / 2,
        bounds_position.y - safe_inset,
    );
    clamp_position_to_bounds(
        centered,
        expanded_size,
        bounds_position,
        bounds_size,
        safe_inset,
    )
}

fn island_collapsed_geometry(
    current: WidgetRect,
    collapsed_size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    safe_inset: i32,
    previous: Option<WidgetGeometryState>,
) -> (WidgetRect, DockState) {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let previous_island = previous.filter(|value| value.compact_mode == CompactMode::Island);
    let x = previous_island
        .map(|value| {
            if value.user_moved_expanded {
                current.position.x + (current.size.width as i32 - collapsed_size.width as i32) / 2
            } else {
                value.collapsed_rect.position.x
            }
        })
        .unwrap_or_else(|| {
            monitor_position.x + (monitor_size.width as i32 - collapsed_size.width as i32) / 2
        });
    let position = clamp_position_to_monitor(
        PhysicalPosition::new(x, monitor_position.y - safe_inset),
        collapsed_size,
        monitor,
        safe_inset,
    );
    let dock = DockState {
        horizontal: None,
        vertical: Some(VerticalDock::Top),
    };
    (
        WidgetRect {
            position: snap_position(position, collapsed_size, dock, monitor, safe_inset),
            size: collapsed_size,
        },
        dock,
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
    if rect.size.width > rect.size.height.saturating_mul(3) {
        CompactMode::Island
    } else {
        CompactMode::Float
    }
}

#[tauri::command]
fn expand_widget(
    work_area: Option<WorkAreaPayload>,
    compact_layout: Option<String>,
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
    let collapsed_size = collapsed_physical_size(compact_mode, scale_factor, safe_inset);
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
    let (collapsed_rect, dock) = if compact_mode == CompactMode::Island {
        island_collapsed_geometry(
            current,
            collapsed_size,
            &monitor,
            safe_inset as i32,
            previous,
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
            &monitor,
            work_area,
            safe_inset as i32,
        ),
        size: expanded_size,
    };

    if let Ok(mut geometry) = state.geometry.lock() {
        *geometry = Some(WidgetGeometryState {
            mode: WidgetMode::Expanded,
            compact_mode,
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
    let bounds = work_area.map(|area| {
        (
            PhysicalPosition::new(area.position.x, area.position.y),
            PhysicalSize::new(area.size.width, area.size.height),
        )
    });
    let fallback_bounds = monitor
        .as_ref()
        .map(|item| (*item.position(), *item.size()));
    let active_bounds = bounds.or(fallback_bounds);
    let expanded_height = bounded_expanded_height(
        content_height,
        scale_factor,
        safe_inset,
        active_bounds.map(|(_, size)| size.height),
    );
    let expanded_size = PhysicalSize::new(expanded_width, expanded_height);
    let previous = state.geometry.lock().ok().and_then(|value| *value);

    let next_position = match (previous, active_bounds) {
        (Some(geometry), Some((bounds_position, bounds_size))) if geometry.user_moved_expanded => {
            clamp_position_to_bounds(
                current.position,
                expanded_size,
                bounds_position,
                bounds_size,
                safe_inset as i32,
            )
        }
        (Some(geometry), Some(_)) => {
            let monitor = monitor
                .as_ref()
                .ok_or_else(|| "widget monitor missing".to_string())?;
            expanded_position(
                geometry.collapsed_rect,
                expanded_size,
                geometry.dock,
                geometry.compact_mode,
                monitor,
                work_area,
                safe_inset as i32,
            )
        }
        (_, Some((bounds_position, bounds_size))) => clamp_position_to_bounds(
            current.position,
            expanded_size,
            bounds_position,
            bounds_size,
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
            collapsed_physical_size(CompactMode::Float, 1.0, 4),
            PhysicalSize::new(100, 100)
        );
        assert_eq!(
            collapsed_physical_size(CompactMode::Island, 1.0, 4),
            PhysicalSize::new(408, 46)
        );
        assert_eq!(
            infer_compact_mode(WidgetRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(408, 46),
            }),
            CompactMode::Island
        );
    }

    #[test]
    fn island_expansion_stays_top_attached_and_centered() {
        let position = island_expanded_position_in_bounds(
            WidgetRect {
                position: PhysicalPosition::new(756, -4),
                size: PhysicalSize::new(408, 46),
            },
            PhysicalSize::new(560, 280),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(680, -4));
    }

    #[test]
    fn expanded_height_tracks_content_and_respects_work_area() {
        assert_eq!(bounded_expanded_height(213.4, 1.0, 4, Some(1040)), 221);
        assert_eq!(bounded_expanded_height(40.0, 1.0, 4, Some(1040)), 168);
        assert_eq!(bounded_expanded_height(2_000.0, 1.0, 4, Some(700)), 708);
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
    compact_layout: Option<String>,
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
    let collapsed_size = collapsed_physical_size(compact_mode, scale_factor, safe_inset);
    let Some(monitor) = monitor else {
        window
            .set_size(collapsed_size)
            .map_err(|_| "failed to resize widget".to_string())?;
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let previous = state.geometry.lock().ok().and_then(|value| *value);
    let (collapsed_rect, dock) = if compact_mode == CompactMode::Island {
        island_collapsed_geometry(
            current,
            collapsed_size,
            &monitor,
            safe_inset as i32,
            previous,
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
    let compact_mode = state
        .geometry
        .lock()
        .ok()
        .and_then(|value| *value)
        .map(|value| value.compact_mode)
        .unwrap_or_else(|| infer_compact_mode(current));
    let collapsed_size = collapsed_physical_size(compact_mode, scale_factor, safe_inset);
    let mode = state
        .geometry
        .lock()
        .ok()
        .and_then(|value| *value)
        .map(|value| value.mode)
        .unwrap_or_else(|| infer_mode(current, collapsed_size));
    if let Ok(mut drag_mode) = state.drag_mode.lock() {
        *drag_mode = Some(mode);
    }
    Ok(())
}

#[tauri::command]
fn finish_widget_drag(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let safe_inset = logical_to_physical(EDGE_SAFE_INSET_LOGICAL, scale_factor);
    let previous_geometry = state.geometry.lock().ok().and_then(|value| *value);
    let compact_mode = previous_geometry
        .map(|value| value.compact_mode)
        .unwrap_or_else(|| infer_compact_mode(current));
    let collapsed_size = collapsed_physical_size(compact_mode, scale_factor, safe_inset);
    let mode = state
        .drag_mode
        .lock()
        .ok()
        .and_then(|mut value| value.take())
        .or_else(|| previous_geometry.map(|value| value.mode))
        .unwrap_or_else(|| infer_mode(current, collapsed_size));

    match mode {
        WidgetMode::Collapsed => {
            let (collapsed_rect, dock) = if compact_mode == CompactMode::Island {
                island_collapsed_geometry(
                    current,
                    collapsed_size,
                    &monitor,
                    safe_inset as i32,
                    previous_geometry,
                )
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
                )
            };
            window
                .set_position(collapsed_rect.position)
                .map_err(|_| "failed to position widget".to_string())?;
            if let Ok(mut geometry) = state.geometry.lock() {
                *geometry = Some(WidgetGeometryState {
                    mode: WidgetMode::Collapsed,
                    compact_mode,
                    dock,
                    collapsed_rect,
                    expanded_rect: None,
                    user_moved_expanded: false,
                });
            }
        }
        WidgetMode::Expanded => {
            let current_position = clamp_position_to_monitor(
                current.position,
                current.size,
                &monitor,
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
        }
    }
    Ok(())
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
    let app = tauri::Builder::default()
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
            let preferences = load_preferences(&preferences_path);
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(12))
                .redirect(reqwest::redirect::Policy::none())
                .user_agent("QuotaFloat/0.1")
                .build()
                .expect("static HTTP client configuration must be valid");
            app.manage(AppState {
                client,
                preferences: Mutex::new(preferences.clone()),
                preferences_path,
                runtime_state_path,
                fetch_lock: tokio::sync::Mutex::new(()),
                snapshot_cache: Mutex::new(None),
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
            export_app_data,
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
