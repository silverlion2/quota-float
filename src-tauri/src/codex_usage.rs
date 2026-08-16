use std::{
    collections::BTreeMap,
    env,
    fs::{self, File},
    io::{self, BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};

use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MAX_SESSION_FILES: usize = 512;
const MAX_DISCOVERED_FILES: usize = MAX_SESSION_FILES * 4;
const MAX_SCAN_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_METADATA_LINE_BYTES: usize = 64 * 1024;
const LONG_CONTEXT_THRESHOLD: u64 = 272_000;
const INDEX_SCHEMA_VERSION: u8 = 2;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CodexTokenUsageBucket {
    pub bucket_start: String,
    pub model: String,
    pub context_tier: String,
    pub project: String,
    pub terminal: String,
    pub session_key: String,
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub cache_write_input_tokens: u64,
    pub output_tokens: u64,
    pub reasoning_output_tokens: u64,
    pub total_tokens: u64,
    pub requests: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTokenUsageReport {
    pub generated_at: String,
    pub range_days: u32,
    pub scanned_files: usize,
    pub indexed_files: usize,
    pub reused_files: usize,
    pub incremental_files: usize,
    pub skipped_files: usize,
    pub scanned_bytes: u64,
    pub matched_events: u64,
    pub scan_duration_ms: u64,
    pub cache_status: String,
    pub truncated: bool,
    pub buckets: Vec<CodexTokenUsageBucket>,
}

#[derive(Debug, Default, Deserialize)]
struct TokenUsageValue {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    cache_write_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    reasoning_output_tokens: u64,
    #[serde(default)]
    total_tokens: u64,
}

#[derive(Debug, Default, Deserialize)]
struct TokenUsageInfo {
    last_token_usage: Option<TokenUsageValue>,
}

#[derive(Debug, Default, Deserialize)]
struct MetadataPayload {
    #[serde(rename = "type")]
    kind: Option<String>,
    model: Option<String>,
    cwd: Option<String>,
    source: Option<String>,
    originator: Option<String>,
    info: Option<TokenUsageInfo>,
}

#[derive(Debug, Deserialize)]
struct MetadataRecord {
    timestamp: Option<String>,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    payload: MetadataPayload,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SessionContext {
    model: String,
    project: String,
    terminal: String,
    session_key: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct CachedSessionFile {
    size: u64,
    modified_millis: u64,
    cursor: u64,
    context: SessionContext,
    buckets: Vec<CodexTokenUsageBucket>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct PersistedUsageIndex {
    schema_version: u8,
    files: BTreeMap<String, CachedSessionFile>,
}

#[derive(Debug, Default)]
struct BucketAccumulator {
    input_tokens: u64,
    cached_input_tokens: u64,
    cache_write_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
    requests: u64,
}

type BucketKey = (String, String, String, String, String, String);

struct BoundedLine {
    retained: bool,
    complete: bool,
    consumed: u64,
}

fn codex_home() -> Option<PathBuf> {
    env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|value| value.join(".codex")))
}

fn collect_session_files(
    directory: &Path,
    cutoff: SystemTime,
    depth: usize,
    output: &mut Vec<(SystemTime, u64, PathBuf)>,
) {
    if depth > 6 || output.len() >= MAX_DISCOVERED_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if output.len() >= MAX_DISCOVERED_FILES {
            return;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_session_files(&path, cutoff, depth + 1, output);
            continue;
        }
        if !file_type.is_file()
            || path.extension().and_then(|value| value.to_str()) != Some("jsonl")
        {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if modified >= cutoff {
            output.push((modified, metadata.len(), path));
        }
    }
}

fn contains_marker(line: &[u8], marker: &[u8]) -> bool {
    line.windows(marker.len()).any(|window| window == marker)
}

/// Reads one JSONL record while refusing to retain oversized message/content lines.
fn read_bounded_line<R: BufRead>(
    reader: &mut R,
    line: &mut Vec<u8>,
) -> io::Result<Option<BoundedLine>> {
    line.clear();
    let mut oversized = false;
    let mut saw_data = false;
    let mut consumed = 0u64;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if saw_data {
                Ok(Some(BoundedLine {
                    retained: !oversized,
                    complete: false,
                    consumed,
                }))
            } else {
                Ok(None)
            };
        }
        saw_data = true;
        let newline = available.iter().position(|byte| *byte == b'\n');
        let take = newline.unwrap_or(available.len());
        if !oversized {
            if line.len().saturating_add(take) <= MAX_METADATA_LINE_BYTES {
                line.extend_from_slice(&available[..take]);
            } else {
                oversized = true;
                line.clear();
            }
        }
        let chunk = take + usize::from(newline.is_some());
        reader.consume(chunk);
        consumed = consumed.saturating_add(chunk as u64);
        if newline.is_some() {
            return Ok(Some(BoundedLine {
                retained: !oversized,
                complete: true,
                consumed,
            }));
        }
    }
}

fn safe_project(cwd: &str) -> String {
    let normalized = cwd.trim().trim_end_matches(['/', '\\']);
    let candidate = Path::new(normalized)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim();
    if candidate.is_empty() || candidate.len() > 80 || candidate.chars().any(char::is_control) {
        "Unknown".to_string()
    } else {
        candidate.to_string()
    }
}

fn safe_terminal(source: Option<&str>, originator: Option<&str>) -> String {
    let value = source.or(originator).unwrap_or("").to_ascii_lowercase();
    if value.contains("vscode") || value.contains("visual_studio") {
        "VS Code".to_string()
    } else if value.contains("desktop") || value.contains("app") {
        "Desktop".to_string()
    } else if value.contains("cli") || value.contains("shell") || value.contains("terminal") {
        "CLI".to_string()
    } else if value.contains("subagent") || value.contains("agent") {
        "Agent".to_string()
    } else {
        "Other".to_string()
    }
}

fn anonymized_session_key(relative_path: &str) -> String {
    let digest = Sha256::digest(relative_path.as_bytes());
    format!(
        "s-{}",
        digest[..8]
            .iter()
            .map(|value| format!("{value:02x}"))
            .collect::<String>()
    )
}

fn index_file_key(relative_path: &str) -> String {
    Sha256::digest(relative_path.as_bytes())
        .iter()
        .map(|value| format!("{value:02x}"))
        .collect()
}

fn add_record(
    line: &[u8],
    cutoff: DateTime<Utc>,
    context: &mut SessionContext,
    buckets: &mut BTreeMap<BucketKey, BucketAccumulator>,
) -> bool {
    const SESSION_META: &[u8] = b"\"type\":\"session_meta\"";
    const TURN_CONTEXT: &[u8] = b"\"type\":\"turn_context\"";
    const TOKEN_COUNT: &[u8] = b"\"type\":\"token_count\"";
    if !contains_marker(line, SESSION_META)
        && !contains_marker(line, TURN_CONTEXT)
        && !contains_marker(line, TOKEN_COUNT)
    {
        return false;
    }
    let Ok(record) = serde_json::from_slice::<MetadataRecord>(line) else {
        return false;
    };
    if record.kind == "session_meta" {
        if let Some(cwd) = record.payload.cwd.as_deref() {
            context.project = safe_project(cwd);
        }
        context.terminal = safe_terminal(
            record.payload.source.as_deref(),
            record.payload.originator.as_deref(),
        );
        return false;
    }
    if record.kind == "turn_context" {
        if let Some(model) = record
            .payload
            .model
            .filter(|value| !value.trim().is_empty() && value.len() <= 96)
        {
            context.model = model;
        }
        if let Some(cwd) = record.payload.cwd.as_deref() {
            context.project = safe_project(cwd);
        }
        return false;
    }
    if record.kind != "event_msg" || record.payload.kind.as_deref() != Some("token_count") {
        return false;
    }
    let Some(usage) = record.payload.info.and_then(|value| value.last_token_usage) else {
        return false;
    };
    let Some(timestamp) = record
        .timestamp
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
    else {
        return false;
    };
    if timestamp < cutoff {
        return false;
    }
    let Some(bucket_start) = timestamp
        .with_minute(0)
        .and_then(|value| value.with_second(0))
        .and_then(|value| value.with_nanosecond(0))
    else {
        return false;
    };
    let context_tier = if usage.input_tokens > LONG_CONTEXT_THRESHOLD {
        "long"
    } else {
        "short"
    };
    let key = (
        bucket_start.to_rfc3339(),
        if context.model.is_empty() {
            "unknown".to_string()
        } else {
            context.model.clone()
        },
        context_tier.to_string(),
        if context.project.is_empty() {
            "Unknown".to_string()
        } else {
            context.project.clone()
        },
        if context.terminal.is_empty() {
            "Other".to_string()
        } else {
            context.terminal.clone()
        },
        context.session_key.clone(),
    );
    let bucket = buckets.entry(key).or_default();
    bucket.input_tokens = bucket.input_tokens.saturating_add(usage.input_tokens);
    bucket.cached_input_tokens = bucket
        .cached_input_tokens
        .saturating_add(usage.cached_input_tokens.min(usage.input_tokens));
    bucket.cache_write_input_tokens = bucket
        .cache_write_input_tokens
        .saturating_add(usage.cache_write_input_tokens.min(usage.input_tokens));
    bucket.output_tokens = bucket.output_tokens.saturating_add(usage.output_tokens);
    bucket.reasoning_output_tokens = bucket
        .reasoning_output_tokens
        .saturating_add(usage.reasoning_output_tokens.min(usage.output_tokens));
    bucket.total_tokens = bucket
        .total_tokens
        .saturating_add(if usage.total_tokens > 0 {
            usage.total_tokens
        } else {
            usage.input_tokens.saturating_add(usage.output_tokens)
        });
    bucket.requests = bucket.requests.saturating_add(1);
    true
}

fn bucket_key(bucket: &CodexTokenUsageBucket) -> BucketKey {
    (
        bucket.bucket_start.clone(),
        bucket.model.clone(),
        bucket.context_tier.clone(),
        bucket.project.clone(),
        bucket.terminal.clone(),
        bucket.session_key.clone(),
    )
}

fn accumulators_from_buckets(
    buckets: Vec<CodexTokenUsageBucket>,
) -> BTreeMap<BucketKey, BucketAccumulator> {
    buckets
        .into_iter()
        .map(|bucket| {
            let key = bucket_key(&bucket);
            let value = BucketAccumulator {
                input_tokens: bucket.input_tokens,
                cached_input_tokens: bucket.cached_input_tokens,
                cache_write_input_tokens: bucket.cache_write_input_tokens,
                output_tokens: bucket.output_tokens,
                reasoning_output_tokens: bucket.reasoning_output_tokens,
                total_tokens: bucket.total_tokens,
                requests: bucket.requests,
            };
            (key, value)
        })
        .collect()
}

fn buckets_from_accumulators(
    buckets: BTreeMap<BucketKey, BucketAccumulator>,
) -> Vec<CodexTokenUsageBucket> {
    buckets
        .into_iter()
        .map(
            |((bucket_start, model, context_tier, project, terminal, session_key), value)| {
                CodexTokenUsageBucket {
                    bucket_start,
                    model,
                    context_tier,
                    project,
                    terminal,
                    session_key,
                    input_tokens: value.input_tokens,
                    cached_input_tokens: value.cached_input_tokens,
                    cache_write_input_tokens: value.cache_write_input_tokens,
                    output_tokens: value.output_tokens,
                    reasoning_output_tokens: value.reasoning_output_tokens,
                    total_tokens: value.total_tokens,
                    requests: value.requests,
                }
            },
        )
        .collect()
}

fn system_time_millis(value: SystemTime) -> u64 {
    value
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn scan_session_file(
    path: &Path,
    file_size: u64,
    modified_millis: u64,
    start_offset: u64,
    mut context: SessionContext,
    existing_buckets: Vec<CodexTokenUsageBucket>,
    cutoff: DateTime<Utc>,
) -> io::Result<(CachedSessionFile, u64)> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(start_offset))?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    let mut buckets = accumulators_from_buckets(existing_buckets);
    let mut cursor = start_offset;
    let mut bytes_read = 0u64;
    let mut line = Vec::with_capacity(4096);
    loop {
        let line_start = cursor;
        let Some(result) = read_bounded_line(&mut reader, &mut line)? else {
            break;
        };
        bytes_read = bytes_read.saturating_add(result.consumed);
        if !result.complete {
            cursor = line_start;
            break;
        }
        cursor = cursor.saturating_add(result.consumed);
        if result.retained {
            add_record(&line, cutoff, &mut context, &mut buckets);
        }
    }
    Ok((
        CachedSessionFile {
            size: file_size,
            modified_millis,
            cursor,
            context,
            buckets: buckets_from_accumulators(buckets),
        },
        bytes_read,
    ))
}

fn empty_index() -> PersistedUsageIndex {
    PersistedUsageIndex {
        schema_version: INDEX_SCHEMA_VERSION,
        files: BTreeMap::new(),
    }
}

fn load_index(path: &Path, rebuild: bool) -> (PersistedUsageIndex, String) {
    if rebuild {
        return (empty_index(), "rebuilt".to_string());
    }
    let backup = path.with_extension("json.bak");
    let metadata = fs::metadata(path).or_else(|_| fs::metadata(&backup));
    if metadata.as_ref().is_err() || metadata.is_ok_and(|value| value.len() > MAX_INDEX_BYTES) {
        return (empty_index(), "rebuilt".to_string());
    }
    let value = crate::read_json_with_backup(path);
    match serde_json::from_value::<PersistedUsageIndex>(value) {
        Ok(index) if index.schema_version == INDEX_SCHEMA_VERSION => {
            (index, "incremental".to_string())
        }
        _ => (empty_index(), "rebuilt".to_string()),
    }
}

fn collect_from(
    session_root: &Path,
    cache_path: &Path,
    range_days: u32,
    rebuild_index: bool,
) -> Result<CodexTokenUsageReport, String> {
    let started = Instant::now();
    let range_days = range_days.clamp(1, 90);
    let now = Utc::now();
    let cutoff = now - chrono::Duration::days(i64::from(range_days));
    let system_cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(u64::from(range_days) * 86_400))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    if !session_root.is_dir() {
        return Err("Codex session metadata is unavailable.".to_string());
    }

    let mut files = Vec::new();
    collect_session_files(session_root, system_cutoff, 0, &mut files);
    files.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    let discovered_files = files.len();
    files.truncate(MAX_SESSION_FILES);

    let (mut index, mut cache_status) = load_index(cache_path, rebuild_index);
    let mut next_files = BTreeMap::new();
    let mut scanned_files = 0usize;
    let mut reused_files = 0usize;
    let mut incremental_files = 0usize;
    let mut scanned_bytes = 0u64;
    let mut truncated = discovered_files > files.len();

    for (modified, file_size, path) in files {
        let relative = path
            .strip_prefix(session_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let file_key = index_file_key(&relative);
        let modified_millis = system_time_millis(modified);
        let cached = index.files.remove(&file_key);
        if let Some(mut cached) = cached {
            cached.buckets.retain(|bucket| {
                DateTime::parse_from_rfc3339(&bucket.bucket_start)
                    .map(|value| value.with_timezone(&Utc) >= cutoff)
                    .unwrap_or(false)
            });
            if cached.size == file_size
                && cached.modified_millis == modified_millis
                && cached.cursor >= file_size
            {
                reused_files += 1;
                next_files.insert(file_key, cached);
                continue;
            }
            let can_append = file_size >= cached.cursor
                && cached.cursor > 0
                && modified_millis >= cached.modified_millis
                && (file_size > cached.size || cached.cursor < file_size);
            let start_offset = if can_append { cached.cursor } else { 0 };
            let bytes_to_read = file_size.saturating_sub(start_offset);
            if scanned_bytes.saturating_add(bytes_to_read) > MAX_SCAN_BYTES {
                truncated = true;
                next_files.insert(file_key, cached);
                continue;
            }
            let context = if can_append {
                cached.context
            } else {
                SessionContext {
                    session_key: anonymized_session_key(&relative),
                    ..SessionContext::default()
                }
            };
            let existing_buckets = if can_append {
                cached.buckets
            } else {
                Vec::new()
            };
            match scan_session_file(
                &path,
                file_size,
                modified_millis,
                start_offset,
                context,
                existing_buckets,
                cutoff,
            ) {
                Ok((scanned, bytes_read)) => {
                    scanned_files += 1;
                    incremental_files += usize::from(can_append);
                    scanned_bytes = scanned_bytes.saturating_add(bytes_read);
                    next_files.insert(file_key, scanned);
                }
                Err(_) => truncated = true,
            }
        } else {
            if scanned_bytes.saturating_add(file_size) > MAX_SCAN_BYTES {
                truncated = true;
                continue;
            }
            let context = SessionContext {
                session_key: anonymized_session_key(&relative),
                ..SessionContext::default()
            };
            match scan_session_file(
                &path,
                file_size,
                modified_millis,
                0,
                context,
                Vec::new(),
                cutoff,
            ) {
                Ok((scanned, bytes_read)) => {
                    scanned_files += 1;
                    scanned_bytes = scanned_bytes.saturating_add(bytes_read);
                    next_files.insert(file_key, scanned);
                }
                Err(_) => truncated = true,
            }
        }
    }

    if cache_status == "incremental" && scanned_files == 0 && reused_files > 0 {
        cache_status = "reused".to_string();
    }
    let indexed_files = next_files.len();
    let persisted = PersistedUsageIndex {
        schema_version: INDEX_SCHEMA_VERSION,
        files: next_files,
    };
    let cache_value = serde_json::to_value(&persisted)
        .map_err(|_| "Codex token metadata index could not be serialized.".to_string())?;
    if crate::persist_json_value(cache_path, &cache_value).is_err() {
        cache_status = "volatile".to_string();
    }

    let mut aggregate = BTreeMap::<BucketKey, BucketAccumulator>::new();
    for file in persisted.files.values() {
        for bucket in &file.buckets {
            let target = aggregate.entry(bucket_key(bucket)).or_default();
            target.input_tokens = target.input_tokens.saturating_add(bucket.input_tokens);
            target.cached_input_tokens = target
                .cached_input_tokens
                .saturating_add(bucket.cached_input_tokens);
            target.cache_write_input_tokens = target
                .cache_write_input_tokens
                .saturating_add(bucket.cache_write_input_tokens);
            target.output_tokens = target.output_tokens.saturating_add(bucket.output_tokens);
            target.reasoning_output_tokens = target
                .reasoning_output_tokens
                .saturating_add(bucket.reasoning_output_tokens);
            target.total_tokens = target.total_tokens.saturating_add(bucket.total_tokens);
            target.requests = target.requests.saturating_add(bucket.requests);
        }
    }
    let buckets = buckets_from_accumulators(aggregate);
    let matched_events = buckets.iter().map(|bucket| bucket.requests).sum();

    Ok(CodexTokenUsageReport {
        generated_at: now.to_rfc3339(),
        range_days,
        scanned_files,
        indexed_files,
        reused_files,
        incremental_files,
        skipped_files: discovered_files.saturating_sub(indexed_files),
        scanned_bytes,
        matched_events,
        scan_duration_ms: started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
        cache_status,
        truncated,
        buckets,
    })
}

pub fn collect(
    range_days: u32,
    cache_path: &Path,
    rebuild_index: bool,
) -> Result<CodexTokenUsageReport, String> {
    let session_root = codex_home()
        .map(|value| value.join("sessions"))
        .filter(|value| value.is_dir())
        .ok_or_else(|| "Codex session metadata is unavailable.".to_string())?;
    collect_from(&session_root, cache_path, range_days, rebuild_index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn test_context() -> SessionContext {
        SessionContext {
            session_key: "s-test".to_string(),
            ..SessionContext::default()
        }
    }

    #[test]
    fn parses_only_token_metadata_and_tracks_safe_dimensions() {
        let cutoff = DateTime::parse_from_rfc3339("2026-08-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut context = test_context();
        let mut buckets = BTreeMap::new();
        assert!(!add_record(br#"{"timestamp":"2026-08-16T02:00:00Z","type":"session_meta","payload":{"cwd":"C:/work/quiet-project","source":"vscode","instructions":"not retained"}}"#, cutoff, &mut context, &mut buckets));
        assert!(!add_record(br#"{"timestamp":"2026-08-16T02:03:00Z","type":"turn_context","payload":{"model":"gpt-5.6-sol","cwd":"C:/work/quiet-project"}}"#, cutoff, &mut context, &mut buckets));
        assert!(add_record(br#"{"timestamp":"2026-08-16T02:12:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":300000,"cached_input_tokens":250000,"cache_write_input_tokens":1000,"output_tokens":900,"reasoning_output_tokens":400,"total_tokens":300900}}}}"#, cutoff, &mut context, &mut buckets));
        let ((bucket_start, model, tier, project, terminal, session), bucket) =
            buckets.into_iter().next().unwrap();
        assert_eq!(bucket_start, "2026-08-16T02:00:00+00:00");
        assert_eq!(model, "gpt-5.6-sol");
        assert_eq!(tier, "long");
        assert_eq!(project, "quiet-project");
        assert_eq!(terminal, "VS Code");
        assert_eq!(session, "s-test");
        assert_eq!(bucket.total_tokens, 300_900);
        assert_eq!(bucket.requests, 1);
    }

    #[test]
    fn ignores_message_content_and_old_token_events() {
        let cutoff = DateTime::parse_from_rfc3339("2026-08-10T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut context = test_context();
        let mut buckets = BTreeMap::new();
        assert!(!add_record(br#"{"timestamp":"2026-08-16T00:00:00Z","type":"event_msg","payload":{"type":"user_message","message":"token_count"}}"#, cutoff, &mut context, &mut buckets));
        assert!(!add_record(br#"{"timestamp":"2026-08-01T00:00:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}}}"#, cutoff, &mut context, &mut buckets));
        assert!(buckets.is_empty());
    }

    #[test]
    fn bounded_reader_discards_oversized_lines_without_retaining_them() {
        let oversized = vec![b'x'; MAX_METADATA_LINE_BYTES + 1];
        let mut input = oversized;
        input.extend_from_slice(b"\nsmall\n");
        let mut reader = BufReader::new(Cursor::new(input));
        let mut line = Vec::new();
        let first = read_bounded_line(&mut reader, &mut line).unwrap().unwrap();
        assert!(!first.retained);
        assert!(first.complete);
        assert!(line.is_empty());
        let second = read_bounded_line(&mut reader, &mut line).unwrap().unwrap();
        assert!(second.retained);
        assert!(second.complete);
        assert_eq!(line, b"small");
    }

    #[test]
    fn reuses_unchanged_files_and_reads_only_appended_metadata() {
        let stamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!("quota-float-usage-{stamp}"));
        let sessions = root.join("sessions");
        fs::create_dir_all(&sessions).unwrap();
        let session = sessions.join("session.jsonl");
        let cache = root.join("usage-index.json");
        let context = r#"{"timestamp":"2026-08-16T02:00:00Z","type":"turn_context","payload":{"model":"gpt-5.6-sol","cwd":"C:/work/project"}}"#;
        let first_event = r#"{"timestamp":"2026-08-16T02:12:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}}}"#;
        fs::write(&session, format!("{context}\n{first_event}\n")).unwrap();
        let first = collect_from(&sessions, &cache, 90, false).unwrap();
        assert_eq!(first.scanned_files, 1);
        assert_eq!(first.matched_events, 1);
        let persisted = fs::read_to_string(&cache).unwrap();
        assert!(!persisted.contains("session.jsonl"));

        let reused = collect_from(&sessions, &cache, 90, false).unwrap();
        assert_eq!(reused.scanned_files, 0);
        assert_eq!(reused.reused_files, 1);
        assert_eq!(reused.cache_status, "reused");

        let second_event = r#"{"timestamp":"2026-08-16T03:12:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}}"#;
        use std::io::Write;
        let mut append = fs::OpenOptions::new().append(true).open(&session).unwrap();
        writeln!(append, "{second_event}").unwrap();
        append.sync_all().unwrap();
        let incremental = collect_from(&sessions, &cache, 90, false).unwrap();
        assert_eq!(incremental.scanned_files, 1);
        assert_eq!(incremental.incremental_files, 1);
        assert_eq!(incremental.matched_events, 2);
        assert!(incremental.scanned_bytes < fs::metadata(&session).unwrap().len());
        fs::remove_dir_all(root).unwrap();
    }
}
