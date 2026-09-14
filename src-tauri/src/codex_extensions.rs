//! Bounded, read-only inventory of Codex MCP servers and local skills.
//!
//! This module intentionally only projects names and explicit `enabled` flags
//! out of the Codex configuration. It never returns configuration values,
//! commands, URLs, paths, or parser/OS errors.

#![cfg_attr(feature = "wdio", allow(dead_code))]

use std::{
    collections::BTreeSet,
    env,
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
};

use serde::Serialize;

const MAX_CONFIG_BYTES: u64 = 256 * 1024;
const MAX_CONFIG_ENTRIES: usize = 128;
const MAX_SKILL_ENTRIES: usize = 256;
const MAX_DIRECTORY_ENTRIES: usize = 512;
const MAX_NAME_CHARS: usize = 96;

const WARNING_CODEX_HOME_MISSING: &str = "codex_home_missing";
const WARNING_CODEX_HOME_UNREADABLE: &str = "codex_home_unreadable";
const WARNING_CODEX_CONFIG_UNREADABLE: &str = "codex_config_unreadable";
const WARNING_CODEX_CONFIG_INVALID: &str = "codex_config_invalid";
const WARNING_CODEX_CONFIG_OVERSIZE: &str = "codex_config_oversize";
const WARNING_CODEX_SKILLS_UNREADABLE: &str = "codex_skills_unreadable";
const WARNING_AGENT_SKILLS_UNREADABLE: &str = "agent_skills_unreadable";
const WARNING_SCAN_TRUNCATED: &str = "scan_truncated";

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum CodexExtensionStatus {
    Ok,
    Partial,
    NotFound,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum CodexExtensionKind {
    Mcp,
    Skill,
    Plugin,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum CodexExtensionSource {
    CodexConfig,
    CodexSkills,
    AgentSkills,
    PluginCache,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexExtensionEntry {
    pub kind: CodexExtensionKind,
    pub name: String,
    pub enabled: Option<bool>,
    pub source: CodexExtensionSource,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexExtensions {
    pub status: CodexExtensionStatus,
    pub entries: Vec<CodexExtensionEntry>,
    pub truncated: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Default)]
struct Inventory {
    entries: Vec<CodexExtensionEntry>,
    warnings: BTreeSet<String>,
    truncated: bool,
    readable_sources: usize,
}

impl Inventory {
    fn warning(&mut self, code: &'static str) {
        self.warnings.insert(code.to_string());
    }

    fn status(&self) -> CodexExtensionStatus {
        if self.readable_sources == 0 {
            if self.warnings.is_empty()
                || self
                    .warnings
                    .iter()
                    .all(|warning| warning == WARNING_CODEX_HOME_MISSING)
            {
                CodexExtensionStatus::NotFound
            } else {
                CodexExtensionStatus::Partial
            }
        } else if self.warnings.is_empty() && !self.truncated {
            CodexExtensionStatus::Ok
        } else {
            CodexExtensionStatus::Partial
        }
    }

    fn finish(mut self) -> CodexExtensions {
        self.entries.sort_by(|left, right| {
            (&left.source, &left.kind, &left.name).cmp(&(&right.source, &right.kind, &right.name))
        });
        self.entries.dedup();
        if self.truncated {
            self.warning(WARNING_SCAN_TRUNCATED);
        }
        CodexExtensions {
            status: self.status(),
            entries: self.entries,
            truncated: self.truncated,
            warnings: self.warnings.into_iter().collect(),
        }
    }

    fn push(&mut self, entry: CodexExtensionEntry) {
        if self.entries.len() >= MAX_SKILL_ENTRIES {
            self.truncated = true;
            return;
        }
        self.entries.push(entry);
    }
}

#[tauri::command]
pub async fn fetch_codex_extensions(
    window: tauri::WebviewWindow,
) -> Result<CodexExtensions, String> {
    crate::ensure_main_window(&window)?;
    #[cfg(feature = "wdio")]
    return Ok(synthetic_report());

    #[cfg(not(feature = "wdio"))]
    tauri::async_runtime::spawn_blocking(collect)
        .await
        .map_err(|_| "Codex extensions are temporarily unavailable.".to_string())
}

#[cfg(feature = "wdio")]
fn synthetic_report() -> CodexExtensions {
    CodexExtensions {
        status: CodexExtensionStatus::Ok,
        entries: vec![
            CodexExtensionEntry {
                kind: CodexExtensionKind::Mcp,
                name: "example-docs".into(),
                enabled: Some(true),
                source: CodexExtensionSource::CodexConfig,
            },
            CodexExtensionEntry {
                kind: CodexExtensionKind::Mcp,
                name: "example-browser".into(),
                enabled: Some(false),
                source: CodexExtensionSource::CodexConfig,
            },
            CodexExtensionEntry {
                kind: CodexExtensionKind::Skill,
                name: "example-review".into(),
                enabled: None,
                source: CodexExtensionSource::AgentSkills,
            },
            CodexExtensionEntry {
                kind: CodexExtensionKind::Plugin,
                name: "example-design@local".into(),
                enabled: Some(true),
                source: CodexExtensionSource::CodexConfig,
            },
        ],
        truncated: false,
        warnings: Vec::new(),
    }
}

fn collect() -> CodexExtensions {
    let codex_home = env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".codex")));
    let home = dirs::home_dir();
    let agent_skills = home.map(|value| value.join(".agents").join("skills"));
    collect_from_paths(codex_home.as_deref(), agent_skills.as_deref())
}

fn collect_from_paths(codex_home: Option<&Path>, agent_skills: Option<&Path>) -> CodexExtensions {
    let mut inventory = Inventory::default();
    if let Some(home) = codex_home {
        match safe_directory_state(home) {
            DirectoryState::Present => {
                scan_config(&home.join("config.toml"), &mut inventory);
                scan_optional_skills(
                    &home.join("skills"),
                    CodexExtensionSource::CodexSkills,
                    &mut inventory,
                );
            }
            DirectoryState::Missing => inventory.warning(WARNING_CODEX_HOME_MISSING),
            DirectoryState::Unreadable => inventory.warning(WARNING_CODEX_HOME_UNREADABLE),
            DirectoryState::Symlink => inventory.warning(WARNING_CODEX_HOME_UNREADABLE),
        }
    } else {
        inventory.warning(WARNING_CODEX_HOME_MISSING);
    }

    if let Some(skills) = agent_skills {
        if let Some(agents_directory) = skills.parent() {
            match safe_directory_state(agents_directory) {
                DirectoryState::Unreadable | DirectoryState::Symlink => {
                    inventory.warning(WARNING_AGENT_SKILLS_UNREADABLE)
                }
                DirectoryState::Missing | DirectoryState::Present => {
                    continue_scan_agent_skills(skills, &mut inventory)
                }
            }
        } else {
            continue_scan_agent_skills(skills, &mut inventory);
        }
    }

    // A missing optional config/skills directory is normal. A missing Codex
    // home with no agent skills is still explicitly reported as not found.
    inventory.finish()
}

fn continue_scan_agent_skills(path: &Path, inventory: &mut Inventory) {
    match safe_directory_state(path) {
        DirectoryState::Present => scan_skills(path, CodexExtensionSource::AgentSkills, inventory),
        DirectoryState::Missing => {}
        DirectoryState::Unreadable | DirectoryState::Symlink => {
            inventory.warning(WARNING_AGENT_SKILLS_UNREADABLE)
        }
    }
}

fn scan_optional_skills(path: &Path, source: CodexExtensionSource, inventory: &mut Inventory) {
    match safe_directory_state(path) {
        DirectoryState::Present => scan_skills(path, source, inventory),
        DirectoryState::Missing => {}
        DirectoryState::Unreadable | DirectoryState::Symlink => inventory.warning(match source {
            CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
            _ => WARNING_AGENT_SKILLS_UNREADABLE,
        }),
    }
}

fn scan_config(path: &Path, inventory: &mut Inventory) {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return,
        Err(_) => {
            inventory.warning(WARNING_CODEX_CONFIG_UNREADABLE);
            return;
        }
    };
    if is_link(path, &metadata.file_type()) || !metadata.is_file() {
        inventory.warning(WARNING_CODEX_CONFIG_UNREADABLE);
        return;
    }
    if metadata.len() > MAX_CONFIG_BYTES {
        inventory.warning(WARNING_CODEX_CONFIG_OVERSIZE);
        return;
    }
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => {
            inventory.warning(WARNING_CODEX_CONFIG_UNREADABLE);
            return;
        }
    };
    let mut raw = Vec::with_capacity(metadata.len() as usize);
    if file
        .take(MAX_CONFIG_BYTES.saturating_add(1))
        .read_to_end(&mut raw)
        .is_err()
    {
        inventory.warning(WARNING_CODEX_CONFIG_UNREADABLE);
        return;
    }
    if raw.len() as u64 > MAX_CONFIG_BYTES {
        inventory.warning(WARNING_CODEX_CONFIG_OVERSIZE);
        return;
    }
    let Ok(text) = std::str::from_utf8(&raw) else {
        inventory.warning(WARNING_CODEX_CONFIG_INVALID);
        return;
    };
    let value: toml::Value = match toml::from_str(text) {
        Ok(value) => value,
        Err(_) => {
            inventory.warning(WARNING_CODEX_CONFIG_INVALID);
            return;
        }
    };
    inventory.readable_sources += 1;
    scan_config_table(
        &value,
        "mcp_servers",
        CodexExtensionKind::Mcp,
        CodexExtensionSource::CodexConfig,
        inventory,
    );
    scan_config_table(
        &value,
        "plugins",
        CodexExtensionKind::Plugin,
        CodexExtensionSource::CodexConfig,
        inventory,
    );
}

fn scan_config_table(
    root: &toml::Value,
    key: &str,
    kind: CodexExtensionKind,
    source: CodexExtensionSource,
    inventory: &mut Inventory,
) {
    let Some(value) = root.get(key) else {
        return;
    };
    let Some(table) = value.as_table() else {
        inventory.warning(WARNING_CODEX_CONFIG_INVALID);
        return;
    };
    for (index, (name, value)) in table.iter().enumerate() {
        if index >= MAX_CONFIG_ENTRIES {
            inventory.truncated = true;
            break;
        }
        let Some(name) = sanitize_name(name) else {
            continue;
        };
        // Codex's documented shape is `[plugins."name"]` (and likewise for
        // `mcp_servers`) with an optional boolean `enabled` field. Reject
        // scalar/array values and non-boolean flags so malformed entries do
        // not look like successfully discovered extensions.
        let Some(value_table) = value.as_table() else {
            inventory.warning(WARNING_CODEX_CONFIG_INVALID);
            continue;
        };
        let enabled = match value_table.get("enabled") {
            None => None,
            Some(value) => match value.as_bool() {
                Some(value) => Some(value),
                None => {
                    inventory.warning(WARNING_CODEX_CONFIG_INVALID);
                    continue;
                }
            },
        };
        inventory.push(CodexExtensionEntry {
            kind: kind.clone(),
            name,
            enabled,
            source: source.clone(),
        });
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DirectoryState {
    Present,
    Missing,
    Unreadable,
    Symlink,
}

fn safe_directory_state(path: &Path) -> DirectoryState {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return DirectoryState::Missing,
        Err(_) => return DirectoryState::Unreadable,
    };
    if is_link(path, &metadata.file_type()) {
        return DirectoryState::Symlink;
    }
    if metadata.is_dir() {
        DirectoryState::Present
    } else {
        DirectoryState::Unreadable
    }
}

fn scan_skills(path: &Path, source: CodexExtensionSource, inventory: &mut Inventory) {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => {
            inventory.warning(match source {
                CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
                _ => WARNING_AGENT_SKILLS_UNREADABLE,
            });
            return;
        }
    };
    inventory.readable_sources += 1;
    for (count, result) in entries.enumerate() {
        if count >= MAX_DIRECTORY_ENTRIES {
            inventory.truncated = true;
            break;
        }
        let Ok(entry) = result else {
            inventory.warning(match source {
                CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
                _ => WARNING_AGENT_SKILLS_UNREADABLE,
            });
            break;
        };
        let Ok(file_type) = entry.file_type() else {
            inventory.warning(match source {
                CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
                _ => WARNING_AGENT_SKILLS_UNREADABLE,
            });
            continue;
        };
        let directory = entry.path();
        if is_link(&directory, &file_type) {
            continue;
        }
        if !file_type.is_dir() {
            continue;
        }
        if has_skill_file(&directory) {
            add_skill_name(&directory, &source, inventory);
        }
        // Codex's bundled system skills live one level below `.system`.
        if entry.file_name() == ".system" {
            scan_system_skills(&directory, &source, inventory);
        }
    }
}

fn scan_system_skills(path: &Path, source: &CodexExtensionSource, inventory: &mut Inventory) {
    let Ok(entries) = fs::read_dir(path) else {
        inventory.warning(match source {
            CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
            _ => WARNING_AGENT_SKILLS_UNREADABLE,
        });
        return;
    };
    for (index, result) in entries.enumerate() {
        if index >= MAX_DIRECTORY_ENTRIES {
            inventory.truncated = true;
            break;
        }
        let Ok(entry) = result else {
            inventory.warning(match source {
                CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
                _ => WARNING_AGENT_SKILLS_UNREADABLE,
            });
            break;
        };
        let Ok(file_type) = entry.file_type() else {
            inventory.warning(match source {
                CodexExtensionSource::CodexSkills => WARNING_CODEX_SKILLS_UNREADABLE,
                _ => WARNING_AGENT_SKILLS_UNREADABLE,
            });
            continue;
        };
        if !is_link(&entry.path(), &file_type)
            && file_type.is_dir()
            && has_skill_file(&entry.path())
        {
            add_skill_name(&entry.path(), source, inventory);
        }
    }
}

fn has_skill_file(directory: &Path) -> bool {
    let path = directory.join("SKILL.md");
    let Ok(metadata) = fs::symlink_metadata(&path) else {
        return false;
    };
    !is_link(&path, &metadata.file_type()) && metadata.is_file()
}

fn add_skill_name(directory: &Path, source: &CodexExtensionSource, inventory: &mut Inventory) {
    let Some(name) = directory
        .file_name()
        .and_then(|value| value.to_str())
        .and_then(sanitize_name)
    else {
        return;
    };
    inventory.push(CodexExtensionEntry {
        kind: CodexExtensionKind::Skill,
        name,
        enabled: None,
        source: source.clone(),
    });
}

fn sanitize_name(value: &str) -> Option<String> {
    let mut output = String::with_capacity(value.len().min(MAX_NAME_CHARS));
    for character in value.chars().filter(|character| !character.is_control()) {
        if output.chars().count() >= MAX_NAME_CHARS {
            break;
        }
        if character.is_alphanumeric() || matches!(character, '-' | '_' | '.' | ' ' | '@') {
            output.push(character);
        } else {
            output.push('_');
        }
    }
    let trimmed = output.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(unix)]
fn is_link(_path: &Path, file_type: &fs::FileType) -> bool {
    file_type.is_symlink()
}

#[cfg(windows)]
fn is_link(path: &Path, file_type: &fs::FileType) -> bool {
    use std::os::windows::fs::{FileTypeExt, MetadataExt};
    file_type.is_symlink()
        || file_type.is_symlink_dir()
        || file_type.is_symlink_file()
        || fs::symlink_metadata(path)
            .map(|metadata| metadata.file_attributes() & 0x400 != 0)
            .unwrap_or(false)
}

#[cfg(not(any(unix, windows)))]
fn is_link(_path: &Path, file_type: &fs::FileType) -> bool {
    file_type.is_symlink()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "quota-float-codex-{}-{}",
                std::process::id(),
                nonce
            ));
            fs::create_dir_all(&root).unwrap();
            Self { root }
        }
        fn write(&self, relative: &str, content: &str) {
            let path = self.root.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn projects_only_safe_fields_and_preserves_disabled_false() {
        let fixture = Fixture::new();
        fixture.write(
            "config.toml",
            r#"
            [mcp_servers.safe_server]
            command = "do-not-return-this"
            url = "https://private.invalid/path"
            enabled = false
            [plugins.demo]
            enabled = true
        "#,
        );
        fixture.write("skills/my-skill/SKILL.md", "instructions");
        let report = collect_from_paths(Some(&fixture.root), None);
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("do-not-return-this"));
        assert!(!serialized.contains("private.invalid"));
        assert!(report
            .entries
            .iter()
            .any(|entry| entry.name == "safe_server" && entry.enabled == Some(false)));
        assert!(report
            .entries
            .iter()
            .any(|entry| entry.kind == CodexExtensionKind::Plugin));
        assert!(report
            .entries
            .iter()
            .any(|entry| entry.kind == CodexExtensionKind::Skill));
        assert_eq!(report.status, CodexExtensionStatus::Ok);
    }

    #[test]
    fn invalid_and_oversize_config_are_partial_without_raw_errors() {
        let invalid = Fixture::new();
        invalid.write("config.toml", "[mcp_servers.broken\n");
        let report = collect_from_paths(Some(&invalid.root), None);
        assert_eq!(report.status, CodexExtensionStatus::Partial);
        assert!(report
            .warnings
            .contains(&WARNING_CODEX_CONFIG_INVALID.to_string()));
        let oversize = Fixture::new();
        oversize.write(
            "config.toml",
            &format!("#{}", "x".repeat(MAX_CONFIG_BYTES as usize)),
        );
        let report = collect_from_paths(Some(&oversize.root), None);
        assert_eq!(report.status, CodexExtensionStatus::Partial);
        assert!(report
            .warnings
            .contains(&WARNING_CODEX_CONFIG_OVERSIZE.to_string()));
        assert!(report
            .warnings
            .iter()
            .all(|warning| !warning.contains("config.toml")));

        let malformed = Fixture::new();
        malformed.write(
            "config.toml",
            r#"
                [mcp_servers.bad]
                enabled = "false"
                plugins = "not-a-table"
            "#,
        );
        let report = collect_from_paths(Some(&malformed.root), None);
        assert_eq!(report.status, CodexExtensionStatus::Partial);
        assert!(report.entries.is_empty());
        assert!(report
            .warnings
            .contains(&WARNING_CODEX_CONFIG_INVALID.to_string()));
    }

    #[test]
    fn missing_home_is_not_reported_as_success() {
        let fixture = Fixture::new();
        let missing = fixture.root.join("does-not-exist");
        let report = collect_from_paths(Some(&missing), None);
        assert_eq!(report.status, CodexExtensionStatus::NotFound);
        assert!(report.entries.is_empty());
        assert!(report
            .warnings
            .contains(&WARNING_CODEX_HOME_MISSING.to_string()));
    }

    #[test]
    fn serialized_status_matches_the_frontend_contract() {
        assert_eq!(
            serde_json::to_string(&CodexExtensionStatus::NotFound).unwrap(),
            "\"not_found\""
        );
        assert_eq!(
            serde_json::to_string(&CodexExtensionStatus::Partial).unwrap(),
            "\"partial\""
        );
        assert_eq!(
            serde_json::to_string(&CodexExtensionStatus::Ok).unwrap(),
            "\"ok\""
        );
    }

    #[test]
    fn missing_optional_skills_and_valid_plugin_keys_are_supported() {
        let fixture = Fixture::new();
        fixture.write("config.toml", "[plugins.\"design@marketplace\"]\nenabled = false\n[mcp_servers.\"文档\"]\ncommand = 'private-command'\n");
        let report = collect_from_paths(Some(&fixture.root), None);
        assert_eq!(report.status, CodexExtensionStatus::Ok);
        assert!(report
            .entries
            .iter()
            .any(|entry| entry.name == "design@marketplace" && entry.enabled == Some(false)));
        assert!(report
            .entries
            .iter()
            .any(|entry| entry.name == "文档" && entry.enabled.is_none()));
        assert!(!serde_json::to_string(&report)
            .unwrap()
            .contains("private-command"));
    }

    #[test]
    fn invalid_entries_are_partial_without_hiding_valid_siblings() {
        let fixture = Fixture::new();
        fixture.write("config.toml", "[mcp_servers]\ninvalid = 'secret-command'\n[mcp_servers.bad]\nenabled = 'false'\n[mcp_servers.good]\nenabled = true\n");
        let report = collect_from_paths(Some(&fixture.root), None);
        assert_eq!(report.status, CodexExtensionStatus::Partial);
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.entries[0].name, "good");
    }

    #[cfg(unix)]
    #[test]
    fn skips_linked_config_and_skill_source_roots() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        fixture.write(
            "outside/config.toml",
            "[mcp_servers.outside]\nenabled = true\n",
        );
        fixture.write("outside/skills/example/SKILL.md", "private skill body");
        fs::create_dir_all(fixture.root.join("codex")).unwrap();
        symlink(
            fixture.root.join("outside/config.toml"),
            fixture.root.join("codex/config.toml"),
        )
        .unwrap();
        symlink(
            fixture.root.join("outside/skills"),
            fixture.root.join("codex/skills"),
        )
        .unwrap();
        let report = collect_from_paths(Some(&fixture.root.join("codex")), None);
        assert_eq!(report.status, CodexExtensionStatus::Partial);
        assert!(report.entries.is_empty());
        fs::create_dir_all(fixture.root.join("skills/linked-file")).unwrap();
        symlink(
            fixture.root.join("outside/skills/example/SKILL.md"),
            fixture.root.join("skills/linked-file/SKILL.md"),
        )
        .unwrap();
        assert!(collect_from_paths(Some(&fixture.root), None)
            .entries
            .is_empty());
    }

    #[test]
    fn scan_is_bounded() {
        let fixture = Fixture::new();
        for index in 0..(MAX_DIRECTORY_ENTRIES + 20) {
            fixture.write(&format!("skills/skill-{index}/SKILL.md"), "x");
        }
        let report = collect_from_paths(Some(&fixture.root), None);
        assert!(report.truncated);
        assert!(report.entries.len() <= MAX_SKILL_ENTRIES);
        assert!(report
            .warnings
            .contains(&WARNING_SCAN_TRUNCATED.to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinked_skill_directories_and_files() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        fixture.write("skills/real/SKILL.md", "x");
        symlink(
            fixture.root.join("skills/real"),
            fixture.root.join("skills/link-dir"),
        )
        .unwrap();
        symlink(
            fixture.root.join("skills/real/SKILL.md"),
            fixture.root.join("skills/link-file"),
        )
        .unwrap();
        let report = collect_from_paths(Some(&fixture.root), None);
        assert!(report.entries.iter().any(|entry| entry.name == "real"));
        assert!(!report.entries.iter().any(|entry| entry.name == "link-dir"));
        assert!(!report.entries.iter().any(|entry| entry.name == "link-file"));
    }
}
