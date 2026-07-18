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
}

fn default_always_on_top() -> bool {
    true
}
fn default_language() -> String {
    "zh-CN".into()
}
fn default_provider_order() -> Vec<String> {
    ["codex", "qoder", "trae", "workbuddy", "volcengine"]
        .into_iter()
        .map(str::to_string)
        .collect()
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
        }
    }
}

impl WidgetPreferences {
    pub fn normalized(mut self) -> Self {
        self.auto_rotate_seconds = self.auto_rotate_seconds.clamp(5, 300);
        if !matches!(
            self.pinned_provider.as_deref(),
            Some("codex" | "qoder" | "trae" | "workbuddy" | "volcengine")
        ) {
            self.pinned_provider = None;
        }
        let mut provider_order = Vec::new();
        for provider in self.provider_order {
            if matches!(
                provider.as_str(),
                "codex" | "qoder" | "trae" | "workbuddy" | "volcengine"
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
        self
    }
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
        let mut preferences = WidgetPreferences::default();
        preferences.skipped_update_version = Some(" 0.2.0 ".into());
        assert_eq!(
            preferences.normalized().skipped_update_version.as_deref(),
            Some("0.2.0")
        );

        let mut preferences = WidgetPreferences::default();
        preferences.skipped_update_version = Some("x".repeat(65));
        assert_eq!(preferences.normalized().skipped_update_version, None);
    }

    #[test]
    fn provider_order_is_deduplicated_and_completed() {
        let mut preferences = WidgetPreferences::default();
        preferences.provider_order = vec![
            "qoder".into(),
            "unknown".into(),
            "qoder".into(),
            "codex".into(),
        ];
        assert_eq!(
            preferences.normalized().provider_order,
            vec!["qoder", "codex", "trae", "workbuddy", "volcengine"]
        );
    }
}
