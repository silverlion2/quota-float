use crate::models::{ProviderSnapshot, UsageWindow, WidgetPreferences};

const ICON_SIZE: u32 = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskbarIndicator {
    pub(crate) rgba: Vec<u8>,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) tooltip: String,
    pub(crate) remaining_percent: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct TaskbarWorkArea {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

pub(crate) fn indicator(
    snapshots: &[ProviderSnapshot],
    preferences: &WidgetPreferences,
    requested_provider: Option<&str>,
) -> TaskbarIndicator {
    let provider = selected_provider(snapshots, preferences, requested_provider);
    let snapshot = provider.and_then(|id| snapshots.iter().find(|item| item.provider == id));
    let paused = provider.is_some_and(|id| {
        preferences
            .paused_providers
            .iter()
            .any(|paused| paused == id)
    });
    let remaining = snapshot
        .filter(|item| !matches!(item.status.as_str(), "signed_out" | "signed-out"))
        .and_then(tightest_remaining_percent);
    // Never round an incomplete percentage such as 99.9 up to a claimed 100%.
    let rounded = remaining.map(|value| value.floor().clamp(0.0, 100.0) as u8);
    let color = indicator_color(rounded, paused, snapshot.map(|item| item.status.as_str()));
    let glyph = rounded
        .map(|value| value.to_string())
        .unwrap_or_else(|| "?".into());
    let display_name = snapshot
        .map(|item| item.display_name.as_str())
        .or(provider)
        .unwrap_or("Quota Float");
    let tooltip = indicator_tooltip(
        display_name,
        snapshot,
        paused,
        preferences.language.as_str(),
        rounded,
    );

    TaskbarIndicator {
        rgba: render_icon(&glyph, color),
        width: ICON_SIZE,
        height: ICON_SIZE,
        tooltip,
        remaining_percent: rounded,
    }
}

fn selected_provider<'a>(
    snapshots: &'a [ProviderSnapshot],
    preferences: &'a WidgetPreferences,
    requested_provider: Option<&'a str>,
) -> Option<&'a str> {
    if let Some(provider) = requested_provider.filter(|value| !value.trim().is_empty()) {
        return Some(provider);
    }
    if let Some(provider) = preferences.pinned_provider.as_deref() {
        return Some(provider);
    }
    preferences
        .provider_order
        .iter()
        .find(|provider| {
            !preferences.hidden_providers.contains(provider)
                && snapshots
                    .iter()
                    .any(|item| item.provider == provider.as_str())
        })
        .map(String::as_str)
        .or_else(|| snapshots.first().map(|item| item.provider.as_str()))
}

fn tightest_remaining_percent(snapshot: &ProviderSnapshot) -> Option<f64> {
    [
        snapshot.short_window.as_ref(),
        snapshot.weekly_window.as_ref(),
        snapshot.monthly_window.as_ref(),
    ]
    .into_iter()
    .flatten()
    .map(|window| window.remaining_percent)
    .filter(|value| value.is_finite())
    .reduce(f64::min)
    .map(|value| value.clamp(0.0, 100.0))
}

fn tightest_window(snapshot: &ProviderSnapshot) -> Option<&UsageWindow> {
    [
        snapshot.short_window.as_ref(),
        snapshot.weekly_window.as_ref(),
        snapshot.monthly_window.as_ref(),
    ]
    .into_iter()
    .flatten()
    .filter(|window| window.remaining_percent.is_finite())
    .min_by(|left, right| left.remaining_percent.total_cmp(&right.remaining_percent))
}

fn indicator_tooltip(
    display_name: &str,
    snapshot: Option<&ProviderSnapshot>,
    paused: bool,
    language: &str,
    rounded: Option<u8>,
) -> String {
    let english = language == "en";
    let mut lines = vec![format!("Quota Float - {display_name}")];
    if let (Some(_), Some(percent), Some(window)) =
        (snapshot, rounded, snapshot.and_then(tightest_window))
    {
        let window_label = format_window(window.window_seconds, english);
        lines.push(if english {
            format!("Remaining: {percent}% ({window_label})")
        } else {
            format!("剩余额度：{percent}%（{window_label}）")
        });
    } else {
        lines.push(if english {
            "Remaining: unavailable".into()
        } else {
            "剩余额度：暂无数据".into()
        });
    }
    if let Some(snapshot) = snapshot {
        if let Some(balance) = snapshot.balance_remaining.filter(|value| value.is_finite()) {
            let unit = snapshot.balance_unit.as_deref().unwrap_or("");
            let value = format_balance(balance, unit);
            lines.push(if english {
                format!("Balance: {value}")
            } else {
                format!("余额：{value}")
            });
        }
        let status = if paused {
            if english {
                "paused"
            } else {
                "已暂停"
            }
        } else {
            localized_status(snapshot.status.as_str(), english)
        };
        lines.push(if english {
            format!("Status: {status}")
        } else {
            format!("状态：{status}")
        });
    } else {
        let status = if paused {
            if english {
                "paused"
            } else {
                "已暂停"
            }
        } else if english {
            "loading or unavailable"
        } else {
            "加载中或不可用"
        };
        lines.push(if english {
            format!("Status: {status}")
        } else {
            format!("状态：{status}")
        });
    }
    lines.join("\n")
}

fn format_window(seconds: u64, english: bool) -> String {
    if seconds != 0 && seconds.is_multiple_of(604_800) {
        let weeks = seconds / 604_800;
        if english {
            format!("{weeks}w window")
        } else {
            format!("{weeks} 周周期")
        }
    } else if seconds != 0 && seconds.is_multiple_of(86_400) {
        let days = seconds / 86_400;
        if english {
            format!("{days}d window")
        } else {
            format!("{days} 天周期")
        }
    } else if seconds != 0 && seconds.is_multiple_of(3_600) {
        let hours = seconds / 3_600;
        if english {
            format!("{hours}h window")
        } else {
            format!("{hours} 小时周期")
        }
    } else if english {
        "quota window".into()
    } else {
        "额度周期".into()
    }
}

fn format_balance(balance: f64, unit: &str) -> String {
    let amount = if balance.fract().abs() < 0.005 {
        format!("{balance:.0}")
    } else {
        format!("{balance:.2}")
    };
    if unit.trim().is_empty() {
        amount
    } else {
        format!("{amount} {}", unit.trim())
    }
}

fn localized_status(status: &str, english: bool) -> &str {
    if english {
        match status {
            "ok" => "up to date",
            "loading" => "loading",
            "stale" => "stale cached data",
            "unavailable" => "unavailable",
            "signed_out" | "signed-out" => "signed out",
            other => other,
        }
    } else {
        match status {
            "ok" => "已更新",
            "loading" => "加载中",
            "stale" => "缓存数据已过期",
            "unavailable" => "不可用",
            "signed_out" | "signed-out" => "未登录",
            other => other,
        }
    }
}

fn indicator_color(remaining: Option<u8>, paused: bool, status: Option<&str>) -> [u8; 4] {
    if paused {
        return [82, 91, 111, 255];
    }
    if status.is_some_and(|value| value != "ok") {
        return [82, 91, 111, 255];
    }
    match remaining {
        Some(0..=15) => [214, 58, 67, 255],
        Some(16..=40) => [224, 157, 38, 255],
        Some(_) => [43, 155, 102, 255],
        None => [82, 91, 111, 255],
    }
}

fn render_icon(text: &str, background: [u8; 4]) -> Vec<u8> {
    let mut rgba = vec![0; (ICON_SIZE * ICON_SIZE * 4) as usize];
    let center = ICON_SIZE as f64 / 2.0 - 0.5;
    let radius = ICON_SIZE as f64 / 2.0 - 1.0;
    for y in 0..ICON_SIZE {
        for x in 0..ICON_SIZE {
            let dx = x as f64 - center;
            let dy = y as f64 - center;
            if dx * dx + dy * dy <= radius * radius {
                set_pixel(&mut rgba, x, y, background);
            }
        }
    }

    let glyphs = text
        .chars()
        .filter_map(glyph_rows)
        .collect::<Vec<[u8; 5]>>();
    let scale = if glyphs.len() >= 3 { 2 } else { 3 };
    let gap = scale;
    let glyph_width = 3 * scale;
    let total_width =
        glyphs.len() as u32 * glyph_width + glyphs.len().saturating_sub(1) as u32 * gap;
    let start_x = (ICON_SIZE.saturating_sub(total_width)) / 2;
    let start_y = (ICON_SIZE - 5 * scale) / 2;
    for (index, rows) in glyphs.iter().enumerate() {
        let offset_x = start_x + index as u32 * (glyph_width + gap);
        for (row, bits) in rows.iter().enumerate() {
            for column in 0..3 {
                if bits & (1 << (2 - column)) == 0 {
                    continue;
                }
                for py in 0..scale {
                    for px in 0..scale {
                        set_pixel(
                            &mut rgba,
                            offset_x + column * scale + px,
                            start_y + row as u32 * scale + py,
                            [255, 255, 255, 255],
                        );
                    }
                }
            }
        }
    }
    rgba
}

fn glyph_rows(character: char) -> Option<[u8; 5]> {
    Some(match character {
        '0' => [0b111, 0b101, 0b101, 0b101, 0b111],
        '1' => [0b010, 0b110, 0b010, 0b010, 0b111],
        '2' => [0b111, 0b001, 0b111, 0b100, 0b111],
        '3' => [0b111, 0b001, 0b111, 0b001, 0b111],
        '4' => [0b101, 0b101, 0b111, 0b001, 0b001],
        '5' => [0b111, 0b100, 0b111, 0b001, 0b111],
        '6' => [0b111, 0b100, 0b111, 0b101, 0b111],
        '7' => [0b111, 0b001, 0b010, 0b010, 0b010],
        '8' => [0b111, 0b101, 0b111, 0b101, 0b111],
        '9' => [0b111, 0b101, 0b111, 0b001, 0b111],
        '?' => [0b111, 0b001, 0b011, 0b000, 0b010],
        _ => return None,
    })
}

fn set_pixel(rgba: &mut [u8], x: u32, y: u32, color: [u8; 4]) {
    let offset = ((y * ICON_SIZE + x) * 4) as usize;
    rgba[offset..offset + 4].copy_from_slice(&color);
}

pub(crate) fn popup_position(
    anchor_x: i32,
    window_width: u32,
    window_height: u32,
    work_area: TaskbarWorkArea,
    safe_inset: i32,
) -> (i32, i32) {
    let min_x = work_area.x - safe_inset;
    let max_x =
        (work_area.x + work_area.width as i32 - window_width as i32 + safe_inset).max(min_x);
    let min_y = work_area.y - safe_inset;
    let max_y =
        (work_area.y + work_area.height as i32 - window_height as i32 + safe_inset).max(min_y);
    let x = (anchor_x - window_width as i32 + safe_inset).clamp(min_x, max_x);
    (x, max_y)
}

#[cfg(target_os = "windows")]
pub(crate) fn work_area_at(x: i32, y: i32) -> Option<TaskbarWorkArea> {
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct MonitorInfo {
        size: u32,
        monitor: Rect,
        work: Rect,
        flags: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn MonitorFromPoint(point: Point, flags: u32) -> isize;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
    }

    const MONITOR_DEFAULT_TO_NEAREST: u32 = 2;
    let monitor = unsafe { MonitorFromPoint(Point { x, y }, MONITOR_DEFAULT_TO_NEAREST) };
    if monitor == 0 {
        return None;
    }
    let mut info = MonitorInfo {
        size: std::mem::size_of::<MonitorInfo>() as u32,
        monitor: Rect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        work: Rect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        flags: 0,
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
        return None;
    }
    Some(TaskbarWorkArea {
        x: info.work.left,
        y: info.work.top,
        width: (info.work.right - info.work.left).max(0) as u32,
        height: (info.work.bottom - info.work.top).max(0) as u32,
    })
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn work_area_at(_x: i32, _y: i32) -> Option<TaskbarWorkArea> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(percent: f64, seconds: u64) -> UsageWindow {
        UsageWindow {
            remaining_percent: percent,
            resets_at: None,
            window_seconds: seconds,
        }
    }

    fn snapshot() -> ProviderSnapshot {
        ProviderSnapshot {
            provider: "codex".into(),
            display_name: "CODEX".into(),
            plan: None,
            short_window: Some(window(72.0, 18_000)),
            weekly_window: Some(window(19.4, 604_800)),
            monthly_window: None,
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            balance_remaining: Some(12.5),
            balance_unit: Some("credits".into()),
            updated_at: "2026-09-22T00:00:00Z".into(),
            status: "ok".into(),
            message: None,
        }
    }

    #[test]
    fn indicator_uses_tightest_real_window_and_describes_balance() {
        let preferences = WidgetPreferences {
            language: "en".into(),
            ..Default::default()
        };
        let indicator = indicator(&[snapshot()], &preferences, Some("codex"));
        assert_eq!(indicator.remaining_percent, Some(19));
        assert!(indicator.tooltip.contains("Remaining: 19% (1w window)"));
        assert!(indicator.tooltip.contains("Balance: 12.50 credits"));
        assert!(indicator.tooltip.contains("Status: up to date"));
        assert_eq!(indicator.rgba.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
        assert!(indicator.rgba.chunks_exact(4).any(|pixel| pixel[3] == 255));
    }

    #[test]
    fn missing_data_uses_unknown_icon_instead_of_zero() {
        let preferences = WidgetPreferences {
            language: "en".into(),
            ..Default::default()
        };
        let unknown = indicator(&[], &preferences, Some("codex"));
        assert_eq!(unknown.remaining_percent, None);
        assert!(unknown.tooltip.contains("Remaining: unavailable"));
        assert!(unknown.tooltip.contains("loading or unavailable"));

        let mut zero_snapshot = snapshot();
        zero_snapshot.short_window = Some(window(0.0, 18_000));
        zero_snapshot.weekly_window = None;
        let zero = indicator(&[zero_snapshot], &preferences, Some("codex"));
        assert_eq!(zero.remaining_percent, Some(0));
        assert_ne!(unknown.rgba, zero.rgba);
    }

    #[test]
    fn paused_provider_is_explicit_without_losing_cached_metric() {
        let preferences = WidgetPreferences {
            language: "en".into(),
            paused_providers: vec!["codex".into()],
            ..Default::default()
        };
        let indicator = indicator(&[snapshot()], &preferences, Some("codex"));
        assert_eq!(indicator.remaining_percent, Some(19));
        assert!(indicator.tooltip.contains("Status: paused"));
    }

    #[test]
    fn stale_badge_is_visibly_distinct_and_signed_out_suppresses_cached_percent() {
        let preferences = WidgetPreferences {
            language: "en".into(),
            ..Default::default()
        };
        let healthy = indicator(&[snapshot()], &preferences, Some("codex"));
        let mut value = snapshot();
        value.status = "stale".into();
        let stale = indicator(&[value.clone()], &preferences, Some("codex"));
        assert_eq!(stale.remaining_percent, healthy.remaining_percent);
        assert_ne!(stale.rgba, healthy.rgba);
        assert!(stale.tooltip.contains("stale cached data"));
        value.status = "signed_out".into();
        let signed_out = indicator(&[value], &preferences, Some("codex"));
        assert_eq!(signed_out.remaining_percent, None);
        assert!(signed_out.tooltip.contains("signed out"));
    }

    #[test]
    fn indicator_does_not_round_nearly_full_quota_up_to_full() {
        let mut value = snapshot();
        value.short_window = Some(window(99.9, 18_000));
        value.weekly_window = None;
        let result = indicator(&[value], &WidgetPreferences::default(), Some("codex"));
        assert_eq!(result.remaining_percent, Some(99));
    }

    #[test]
    fn popup_is_bottom_right_anchored_and_clamped_to_work_area() {
        let bounds = TaskbarWorkArea {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        assert_eq!(popup_position(3760, 560, 400, bounds, 4), (3204, 644));
        assert_eq!(popup_position(1940, 560, 400, bounds, 4), (1916, 644));
    }
}
