use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub remaining_percent: f64,
    pub resets_at: Option<String>,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub short_window: Option<UsageWindow>,
    pub weekly_window: Option<UsageWindow>,
    pub monthly_window: Option<UsageWindow>,
    pub reset_credits: Option<u64>,
    pub reset_credit_expires_at: Vec<String>,
    pub balance_remaining: Option<f64>,
    pub balance_unit: Option<String>,
    pub updated_at: String,
    pub status: String,
    pub message: Option<String>,
}

impl ProviderSnapshot {
    pub fn failure(status: &str, message: &str) -> Self {
        Self::provider_failure("codex", "CODEX", status, message)
    }

    pub fn provider_failure(
        provider: &str,
        display_name: &str,
        status: &str,
        message: &str,
    ) -> Self {
        Self {
            provider: provider.into(),
            display_name: display_name.into(),
            plan: None,
            short_window: None,
            weekly_window: None,
            monthly_window: None,
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            balance_remaining: None,
            balance_unit: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPreferences {
    pub locked: bool,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(default)]
    pub stay_expanded: bool,
    pub pinned_provider: Option<String>,
    #[serde(default = "default_provider_order")]
    pub provider_order: Vec<String>,
    pub auto_rotate_seconds: u64,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub skipped_update_version: Option<String>,
    #[serde(default)]
    pub hidden_providers: Vec<String>,
    #[serde(default)]
    pub collapsed_providers: Vec<String>,
    #[serde(default = "default_layout_mode")]
    pub layout_mode: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_alert_threshold")]
    pub alert_threshold: u8,
    #[serde(default = "default_true")]
    pub notifications_enabled: bool,
    #[serde(default = "default_true")]
    pub notify_on_reset: bool,
    #[serde(default = "default_true")]
    pub notify_on_recovery: bool,
    #[serde(default = "default_quiet_start")]
    pub quiet_hours_start: u8,
    #[serde(default = "default_quiet_end")]
    pub quiet_hours_end: u8,
    #[serde(default = "default_notification_cooldown")]
    pub notification_cooldown_minutes: u16,
    #[serde(default = "default_update_channel")]
    pub update_channel: String,
    #[serde(default = "default_true")]
    pub automatic_updates: bool,
}

fn default_always_on_top() -> bool {
    true
}
fn default_language() -> String {
    "zh-CN".into()
}
fn default_provider_order() -> Vec<String> {
    [
        "codex",
        "qoder",
        "trae",
        "workbuddy",
        "volcengine",
        "antigravity",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}
fn default_layout_mode() -> String {
    "standard".into()
}
fn default_accent_color() -> String {
    "#397ae0".into()
}
fn default_alert_threshold() -> u8 {
    15
}
fn default_true() -> bool {
    true
}
fn default_quiet_start() -> u8 {
    22
}
fn default_quiet_end() -> u8 {
    8
}
fn default_notification_cooldown() -> u16 {
    120
}
fn default_update_channel() -> String {
    "stable".into()
}

impl Default for WidgetPreferences {
    fn default() -> Self {
        Self {
            locked: false,
            always_on_top: true,
            stay_expanded: false,
            pinned_provider: None,
            provider_order: default_provider_order(),
            auto_rotate_seconds: 12,
            language: default_language(),
            skipped_update_version: None,
            hidden_providers: Vec::new(),
            collapsed_providers: Vec::new(),
            layout_mode: default_layout_mode(),
            accent_color: default_accent_color(),
            alert_threshold: default_alert_threshold(),
            notifications_enabled: true,
            notify_on_reset: true,
            notify_on_recovery: true,
            quiet_hours_start: default_quiet_start(),
            quiet_hours_end: default_quiet_end(),
            notification_cooldown_minutes: default_notification_cooldown(),
            update_channel: default_update_channel(),
            automatic_updates: true,
        }
    }
}

impl WidgetPreferences {
    pub fn normalized(mut self) -> Self {
        self.auto_rotate_seconds = self.auto_rotate_seconds.clamp(5, 300);
        if !matches!(
            self.pinned_provider.as_deref(),
            Some("codex" | "qoder" | "trae" | "workbuddy" | "volcengine" | "antigravity")
        ) {
            self.pinned_provider = None;
        }
        let mut provider_order = Vec::new();
        for provider in self.provider_order {
            if matches!(
                provider.as_str(),
                "codex" | "qoder" | "trae" | "workbuddy" | "volcengine" | "antigravity"
            ) && !provider_order.contains(&provider)
            {
                provider_order.push(provider);
            }
        }
        for provider in default_provider_order() {
            if !provider_order.contains(&provider) {
                provider_order.push(provider);
            }
        }
        self.provider_order = provider_order;
        if self.language != "en" && self.language != "zh-CN" {
            self.language = default_language();
        }
        self.skipped_update_version = self.skipped_update_version.and_then(|value| {
            let value = value.trim();
            (!value.is_empty() && value.len() <= 64).then(|| value.to_string())
        });
        let normalize_providers = |values: Vec<String>| {
            let mut normalized = Vec::new();
            for provider in values {
                if matches!(
                    provider.as_str(),
                    "codex" | "qoder" | "trae" | "workbuddy" | "volcengine" | "antigravity"
                ) && !normalized.contains(&provider)
                {
                    normalized.push(provider);
                }
            }
            normalized
        };
        self.hidden_providers = normalize_providers(self.hidden_providers);
        self.collapsed_providers = normalize_providers(self.collapsed_providers);
        if self.hidden_providers.len() >= default_provider_order().len() {
            self.hidden_providers.clear();
        }
        if !matches!(
            self.layout_mode.as_str(),
            "compact" | "standard" | "detailed"
        ) {
            self.layout_mode = default_layout_mode();
        }
        if !is_safe_hex_color(&self.accent_color) {
            self.accent_color = default_accent_color();
        }
        self.alert_threshold = self.alert_threshold.clamp(1, 99);
        self.quiet_hours_start = self.quiet_hours_start.min(23);
        self.quiet_hours_end = self.quiet_hours_end.min(23);
        self.notification_cooldown_minutes = self.notification_cooldown_minutes.clamp(5, 1440);
        if !matches!(self.update_channel.as_str(), "stable" | "beta") {
            self.update_channel = default_update_channel();
        }
        self
    }
}

fn is_safe_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::WidgetPreferences;

    #[test]
    fn skipped_update_version_is_optional_for_existing_preferences() {
        let preferences: WidgetPreferences = serde_json::from_str(
            r#"{"locked":false,"pinnedProvider":null,"autoRotateSeconds":12}"#,
        )
        .expect("legacy preferences should remain readable");

        assert_eq!(preferences.skipped_update_version, None);
    }

    #[test]
    fn skipped_update_version_is_trimmed_and_bounded() {
        let preferences = WidgetPreferences {
            skipped_update_version: Some(" 0.2.0 ".into()),
            ..Default::default()
        };
        assert_eq!(
            preferences.normalized().skipped_update_version.as_deref(),
            Some("0.2.0")
        );

        let preferences = WidgetPreferences {
            skipped_update_version: Some("x".repeat(65)),
            ..Default::default()
        };
        assert_eq!(preferences.normalized().skipped_update_version, None);
    }

    #[test]
    fn provider_order_is_deduplicated_and_completed() {
        let preferences = WidgetPreferences {
            provider_order: vec![
                "qoder".into(),
                "unknown".into(),
                "qoder".into(),
                "codex".into(),
            ],
            ..Default::default()
        };
        assert_eq!(
            preferences.normalized().provider_order,
            vec![
                "qoder",
                "codex",
                "trae",
                "workbuddy",
                "volcengine",
                "antigravity",
            ]
        );
    }

    #[test]
    fn quality_of_life_preferences_are_safely_normalized() {
        let preferences = WidgetPreferences {
            hidden_providers: vec![
                "codex".into(),
                "qoder".into(),
                "trae".into(),
                "workbuddy".into(),
                "volcengine".into(),
                "antigravity".into(),
            ],
            accent_color: "red; background: url(x)".into(),
            alert_threshold: 0,
            ..Default::default()
        };
        let normalized = preferences.normalized();
        assert!(normalized.hidden_providers.is_empty());
        assert_eq!(normalized.accent_color, "#397ae0");
        assert_eq!(normalized.alert_threshold, 1);
    }
}
