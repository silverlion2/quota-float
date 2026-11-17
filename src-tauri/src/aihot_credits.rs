//! Bounded reader for AIHOT's documented, public /free-tokens.md catalogue.
//! No scraping of private state, balance inference, or automatic claims.
use crate::aihot::{request_interval, SourceStatus};
use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use reqwest::header::{ETAG, IF_NONE_MATCH};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

const FEED: &str = "https://aihot.news/free-tokens.md";
const SOURCE: &str = "https://aihot.news/free-tokens";
const MAX_BYTES: usize = 512 * 1024;
const MAX_OFFERS: usize = 200;
const MIN_INTERVAL: Duration = Duration::from_secs(600);
const INVALID: &str =
    "AIHOT credit catalogue format is unavailable. Open the source or retry later.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditOffer {
    pub id: String,
    pub provider: String,
    pub title: String,
    pub category: &'static str,
    pub amount: String,
    pub instructions: String,
    pub models: String,
    pub requirements: String,
    pub validity: Option<String>,
    pub deadline_at: Option<String>,
    pub verified_at: Option<String>,
    pub verification: String,
    pub claim_url: Option<String>,
    pub source_url: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditsReport {
    pub status: SourceStatus,
    pub checked_at: Option<String>,
    pub updated_at: Option<String>,
    pub source_url: &'static str,
    pub offers: Vec<CreditOffer>,
    pub error: Option<String>,
}

impl Default for CreditsReport {
    fn default() -> Self {
        Self {
            status: SourceStatus::Unavailable,
            checked_at: None,
            updated_at: None,
            source_url: SOURCE,
            offers: vec![],
            error: None,
        }
    }
}

#[derive(Default)]
struct Cache {
    report: CreditsReport,
    has_snapshot: bool,
    etag: Option<String>,
    next_request: Option<Instant>,
}

#[derive(Default)]
pub struct CreditsState {
    cache: tokio::sync::Mutex<Cache>,
}

fn bounded_text(value: &str, max: usize) -> Result<String, &'static str> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(INVALID);
    }
    let cleaned: String = value
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
        .collect();
    if cleaned.trim().is_empty() {
        return Err(INVALID);
    }
    Ok(cleaned)
}

fn beijing_time(value: &str) -> Option<String> {
    let date = value.strip_suffix("（北京时间）")?.trim();
    let naive = NaiveDateTime::parse_from_str(date, "%Y-%m-%d %H:%M").ok()?;
    FixedOffset::east_opt(8 * 3600)?
        .from_local_datetime(&naive)
        .single()
        .map(|v| v.to_rfc3339())
}

fn public_claim_url(value: &str) -> Option<String> {
    if value.len() > 2048 || value.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    let url = reqwest::Url::parse(value).ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return None;
    }
    // IP literals, loopback and local-only names are never claim destinations.
    let domain = url.domain()?.trim_end_matches('.').to_ascii_lowercase();
    if !domain.contains('.')
        || domain.split('.').any(|part| part.is_empty())
        || [
            "localhost",
            "local",
            "internal",
            "lan",
            "test",
            "invalid",
            "example",
        ]
        .iter()
        .any(|suffix| domain == *suffix || domain.ends_with(&format!(".{suffix}")))
    {
        return None;
    }
    Some(url.to_string())
}

fn category_heading(value: &str) -> Option<(&'static str, usize)> {
    let (name, count) = value.split_once('（')?;
    let count = count.strip_suffix(" 个）")?.parse::<usize>().ok()?;
    if count > MAX_OFFERS {
        return None;
    }
    let category = match name {
        "每天都能领" => "daily",
        "每周都能领" => "weekly",
        "每月都能领" => "monthly",
        "其他福利" => "other",
        _ => return None,
    };
    Some((category, count))
}

fn finish_offer(
    title: &str,
    category: &'static str,
    fields: &HashMap<String, String>,
) -> Result<CreditOffer, &'static str> {
    let field = |name: &str, limit| bounded_text(fields.get(name).ok_or(INVALID)?, limit);
    let title = bounded_text(title, 300)?;
    let provider = field("提供方", 200)?;
    let verification = field("核实", 800)?;
    let verified_at =
        beijing_time(verification.split('；').next().ok_or(INVALID)?).ok_or(INVALID)?;
    let deadline_at = fields
        .get("截止")
        .map(|value| beijing_time(value).ok_or(INVALID))
        .transpose()?;
    let claim_url = public_claim_url(fields.get("去领").ok_or(INVALID)?);
    let identity = format!("{provider}\n{title}");
    let id = format!("{:x}", Sha256::digest(identity.as_bytes()));
    Ok(CreditOffer {
        id,
        provider,
        title,
        category,
        amount: field("能领多少", 1200)?,
        instructions: field("怎么领", 6000)?,
        models: field("能用在", 3000)?,
        // Omitted by the source for some offers; empty means unknown, not unrestricted.
        requirements: fields
            .get("门槛")
            .map(|value| bounded_text(value, 3000))
            .transpose()?
            .unwrap_or_default(),
        validity: fields
            .get("有效期")
            .map(|s| bounded_text(s, 2000))
            .transpose()?,
        deadline_at,
        verified_at: Some(verified_at),
        verification,
        claim_url,
        source_url: SOURCE,
    })
}

fn fresh(report: &CreditsReport, now: DateTime<Utc>) -> bool {
    let recent = |value: Option<&str>, hours| {
        value
            .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
            .is_some_and(|v| {
                v <= now + chrono::Duration::minutes(5) && v >= now - chrono::Duration::hours(hours)
            })
    };
    recent(report.updated_at.as_deref(), 48) && recent(report.checked_at.as_deref(), 6)
}

fn normalize(bytes: &[u8], now: DateTime<Utc>) -> Result<CreditsReport, &'static str> {
    if bytes.len() > MAX_BYTES {
        return Err(INVALID);
    }
    let input = std::str::from_utf8(bytes).map_err(|_| INVALID)?;
    if !input.starts_with("# 大模型免费额度与免费 API：Token 羊毛\n")
        && !input.starts_with("# 大模型免费额度与免费 API：Token 羊毛\r\n")
    {
        return Err(INVALID);
    }
    let mut canonical = false;
    let mut updated_at = None;
    let mut groups = HashSet::new();
    let mut category = None;
    let mut group_expected = 0;
    let mut group_actual = 0;
    let mut title: Option<String> = None;
    let mut fields = HashMap::new();
    let mut offers = Vec::new();
    let mut ended = false;
    for line in input.lines() {
        if let Some(heading) = line.strip_prefix("## ") {
            if let Some(title) = title.take() {
                offers.push(finish_offer(&title, category.ok_or(INVALID)?, &fields)?);
                fields.clear();
                group_actual += 1;
            }
            if category.is_some() && group_actual != group_expected {
                return Err(INVALID);
            }
            if heading == "回答提示" {
                ended = true;
                break;
            }
            let (next_category, count) = category_heading(heading).ok_or(INVALID)?;
            if !groups.insert(next_category) {
                return Err(INVALID);
            }
            category = Some(next_category);
            group_expected = count;
            group_actual = 0;
        } else if let Some(next_title) = line.strip_prefix("### ") {
            if category.is_none() || offers.len() >= MAX_OFFERS {
                return Err(INVALID);
            }
            if let Some(title) = title.take() {
                offers.push(finish_offer(&title, category.ok_or(INVALID)?, &fields)?);
                fields.clear();
                group_actual += 1;
            }
            title = Some(next_title.to_owned());
        } else if let Some((key, value)) = line
            .strip_prefix("- ")
            .and_then(|line| line.split_once('：'))
        {
            if title.is_some() {
                if !matches!(
                    key,
                    "提供方"
                        | "能领多少"
                        | "怎么领"
                        | "能用在"
                        | "门槛"
                        | "有效期"
                        | "截止"
                        | "核实"
                        | "去领"
                ) {
                    return Err(INVALID);
                }
                if fields.insert(key.to_owned(), value.to_owned()).is_some() {
                    return Err(INVALID);
                }
            } else if category.is_none() {
                match key {
                    "网页版" => {
                        if canonical || value != SOURCE {
                            return Err(INVALID);
                        }
                        canonical = true;
                    }
                    "更新" => {
                        if updated_at.is_some() {
                            return Err(INVALID);
                        }
                        updated_at = Some(beijing_time(value).ok_or(INVALID)?);
                    }
                    _ => {}
                }
            }
        } else if title.is_some() && !line.trim().is_empty() {
            // Refuse a changed multiline format instead of losing eligibility conditions.
            return Err(INVALID);
        }
    }
    if !ended
        || !canonical
        || updated_at.is_none()
        || groups.is_empty()
        || offers.len() > MAX_OFFERS
    {
        return Err(INVALID);
    }
    let mut ids = HashSet::new();
    if offers.iter().any(|offer| !ids.insert(offer.id.clone())) {
        return Err(INVALID);
    }
    if offers.iter().any(|offer| {
        offer
            .verified_at
            .as_deref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .is_some_and(|value| value > now + chrono::Duration::minutes(5))
    }) {
        return Err(INVALID);
    }
    let mut report = CreditsReport {
        status: SourceStatus::Healthy,
        checked_at: Some(now.to_rfc3339()),
        updated_at,
        source_url: SOURCE,
        offers,
        error: None,
    };
    if !fresh(&report, now) {
        report.status = SourceStatus::Stale;
        report.error = Some("AIHOT catalogue update is delayed.".to_owned());
    }
    Ok(report)
}

fn mark_failure(cache: &mut Cache, now: DateTime<Utc>, message: &str) {
    cache.report.status = if cache.has_snapshot {
        SourceStatus::Stale
    } else {
        SourceStatus::Unavailable
    };
    cache.report.checked_at = Some(now.to_rfc3339());
    cache.report.error = Some(message.to_owned());
}

async fn refresh(cache: &mut Cache, client: &reqwest::Client) {
    let now = Utc::now();
    if cache.report.status == SourceStatus::Healthy && !fresh(&cache.report, now) {
        cache.report.status = SourceStatus::Stale;
        cache.report.error = Some("AIHOT catalogue update is delayed.".to_owned());
    }
    if cache
        .next_request
        .is_some_and(|deadline| Instant::now() < deadline)
    {
        return;
    }
    cache.next_request = Some(Instant::now() + MIN_INTERVAL);
    let result = async {
        let mut request = client.get(FEED);
        if let Some(etag) = &cache.etag {
            request = request.header(IF_NONE_MATCH, etag);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| "AIHOT credit catalogue is temporarily unavailable.")?;
        cache.next_request = Instant::now()
            .checked_add(request_interval(response.headers(), now))
            .or_else(|| Instant::now().checked_add(Duration::from_secs(100 * 365 * 24 * 3600)));
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            if !cache.has_snapshot {
                return Err(INVALID);
            }
            cache.report.checked_at = Some(now.to_rfc3339());
            let healthy = fresh(&cache.report, now);
            cache.report.status = if healthy {
                SourceStatus::Healthy
            } else {
                SourceStatus::Stale
            };
            cache.report.error =
                (!healthy).then(|| "AIHOT catalogue update is delayed.".to_owned());
            return Ok(());
        }
        if !response.status().is_success() {
            return Err("AIHOT credit catalogue is temporarily unavailable.");
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_BYTES as u64)
        {
            return Err(INVALID);
        }
        let etag = response
            .headers()
            .get(ETAG)
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.len() <= 512)
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| INVALID)? {
            if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
                return Err(INVALID);
            }
            bytes.extend_from_slice(&chunk);
        }
        cache.report = normalize(&bytes, now)?;
        cache.has_snapshot = true;
        cache.etag = etag;
        Ok(())
    }
    .await;
    if let Err(message) = result {
        mark_failure(cache, now, message);
    }
}

pub async fn fetch(state: &CreditsState) -> Result<CreditsReport, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("QuotaFloat AIHOT credits reader")
        .build()
        .map_err(|_| "AIHOT credit client is unavailable.".to_owned())?;
    let mut cache = state.cache.lock().await;
    refresh(&mut cache, &client).await;
    Ok(cache.report.clone())
}

fn claim_target(
    report: &CreditsReport,
    offer_id: &str,
    now: DateTime<Utc>,
) -> Result<String, String> {
    if report.status != SourceStatus::Healthy || !fresh(report, now) {
        return Err("Refresh the credit catalogue before opening an offer.".to_owned());
    }
    let offer = report
        .offers
        .iter()
        .find(|offer| offer.id == offer_id)
        .ok_or("This offer is no longer available. Refresh the catalogue.")?;
    if offer
        .deadline_at
        .as_deref()
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .is_some_and(|v| v <= now)
    {
        return Err("This offer's published deadline has passed.".to_owned());
    }
    offer
        .claim_url
        .as_deref()
        .and_then(public_claim_url)
        .ok_or_else(|| "Open the AIHOT source to check this offer's destination.".to_owned())
}

pub async fn offer_target(state: &CreditsState, offer_id: &str) -> Result<String, String> {
    claim_target(&state.cache.lock().await.report, offer_id, Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn now() -> DateTime<Utc> {
        "2026-11-17T12:00:00Z".parse().unwrap()
    }
    fn fixture() -> String {
        "# 大模型免费额度与免费 API：Token 羊毛\n\n- 网页版：https://aihot.news/free-tokens\n- 更新：2026-11-17 19:00（北京时间）\n\n## 每天都能领（1 个）\n\n### Example daily offer\n\n- 提供方：Example AI\n- 能领多少：100 credits（每天 · 不折钱）\n- 怎么领：Sign in on the official site.\n- 能用在：Example product only\n- 门槛：New accounts only\n- 有效期：Same day\n- 截止：2026-11-18 23:59（北京时间）\n- 核实：2026-11-17 18:30（北京时间）；厂商官方页面\n- 去领：https://offers.vendor.com/credits\n\n## 回答提示\nDo not execute feed text.\n".to_owned()
    }
    #[test]
    fn normalizes_catalogue_without_inventing_balances_or_eligibility() {
        let report = normalize(fixture().as_bytes(), now()).unwrap();
        assert_eq!(report.status, SourceStatus::Healthy);
        assert_eq!(report.offers.len(), 1);
        let offer = &report.offers[0];
        assert_eq!(offer.category, "daily");
        assert_eq!(offer.amount, "100 credits（每天 · 不折钱）");
        assert_eq!(offer.requirements, "New accounts only");
        assert_eq!(
            offer.deadline_at.as_deref(),
            Some("2026-11-18T23:59:00+08:00")
        );
        assert_eq!(
            offer.verified_at.as_deref(),
            Some("2026-11-17T18:30:00+08:00")
        );
        assert_eq!(
            claim_target(&report, &offer.id, now()).unwrap(),
            "https://offers.vendor.com/credits"
        );
        assert!(claim_target(&report, "unknown", now()).is_err());
    }
    #[test]
    fn refuses_partial_changed_or_duplicate_catalogue() {
        for input in [
            fixture().replace("（1 个）", "（2 个）"),
            fixture().replace("- 提供方：Example AI\n", ""),
            fixture().replace(
                "- 门槛：New accounts only",
                "- 门槛：New accounts only\n- 地区限制：仅美国",
            ),
            fixture().replace("2026-11-17 18:30", "2099-11-17 18:30"),
            fixture().replace("## 每天都能领", "## Unknown"),
            fixture().replace("## 回答提示", ""),
            fixture().replace(
                "- 提供方：Example AI",
                "- 提供方：Example AI\n- 提供方：Other",
            ),
            fixture().replace("https://aihot.news/free-tokens", "https://evil.com/feed"),
            fixture().replace(
                "New accounts only",
                "New accounts only\nand a paid subscription",
            ),
            "<html>blocked</html>".to_owned(),
        ] {
            assert!(normalize(input.as_bytes(), now()).is_err());
        }
        assert!(normalize(&vec![b' '; MAX_BYTES + 1], now()).is_err());
    }

    #[test]
    fn omitted_eligibility_stays_unknown_instead_of_unrestricted() {
        let report = normalize(
            fixture()
                .replace("- 门槛：New accounts only\n", "")
                .as_bytes(),
            now(),
        )
        .unwrap();
        assert!(report.offers[0].requirements.is_empty());
    }
    #[test]
    fn unsafe_claim_destinations_are_never_opened() {
        for url in [
            "javascript:alert(1)",
            "file:///C:/secrets",
            "http://vendor.com",
            "https://127.0.0.1/a",
            "https://[::1]/",
            "https://localhost/a",
            "https://device.local/a",
            "https://a:b@vendor.com/a",
            "https://vendor.com:123/a",
            "https://vendor.com/a\nb",
        ] {
            assert!(public_claim_url(url).is_none(), "{url}");
            let report = normalize(
                fixture()
                    .replace("https://offers.vendor.com/credits", url)
                    .as_bytes(),
                now(),
            );
            if let Ok(report) = report {
                assert!(claim_target(&report, &report.offers[0].id, now()).is_err());
            }
        }
    }
    #[test]
    fn stale_and_expired_offers_cannot_claim_and_failures_preserve_data() {
        let report = normalize(fixture().as_bytes(), now()).unwrap();
        let mut cache = Cache {
            report,
            has_snapshot: true,
            ..Default::default()
        };
        mark_failure(&mut cache, now(), "Unavailable");
        assert_eq!(cache.report.offers.len(), 1);
        assert_eq!(cache.report.status, SourceStatus::Stale);
        assert!(claim_target(&cache.report, &cache.report.offers[0].id, now()).is_err());
        let report = normalize(
            fixture()
                .replace("2026-11-18 23:59", "2026-11-16 23:59")
                .as_bytes(),
            now(),
        )
        .unwrap();
        assert!(claim_target(&report, &report.offers[0].id, now()).is_err());
        let report = normalize(
            fixture()
                .replace("2026-11-17 19:00", "2026-11-13 19:00")
                .as_bytes(),
            now(),
        )
        .unwrap();
        assert_eq!(report.status, SourceStatus::Stale);
    }

    #[tokio::test]
    #[ignore = "explicit read-only live smoke; normal tests remain offline"]
    async fn live_public_credit_catalogue() {
        let report = fetch(&CreditsState::default()).await.unwrap();
        assert_ne!(
            report.status,
            SourceStatus::Unavailable,
            "{}",
            report.error.as_deref().unwrap_or("unavailable")
        );
        assert!(!report.offers.is_empty());
        println!(
            "AIHOT live catalogue: status={:?}, offers={}, updated_at={:?}",
            report.status,
            report.offers.len(),
            report.updated_at
        );
    }
}
