use crate::notes::{self, NoteSummary};
use crate::paths::{self, NoteZone};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SearchOptions {
    pub folder: Option<String>,
    pub color: Option<String>,
    pub modified_days: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchHit {
    pub name: String,
    pub title: String,
    pub zone: String,
    pub modified_ms: i64,
    pub color: Option<String>,
    pub snippet: Option<String>,
    pub score: i32,
}

fn zone_matches_filter(zone: &NoteZone, folder: &str) -> bool {
    match folder.trim().to_lowercase().as_str() {
        "inbox" => matches!(zone, NoteZone::Inbox),
        "default" => matches!(zone, NoteZone::Default),
        f if f.starts_with("folder:") => zone.as_str() == f,
        f if !f.is_empty() => {
            if let NoteZone::Folder(id) = zone {
                id.eq_ignore_ascii_case(f) || id.to_lowercase().contains(f)
            } else {
                zone.as_str().eq_ignore_ascii_case(f)
            }
        }
        _ => true,
    }
}

fn parse_search_query(raw: &str) -> (String, SearchOptions) {
    let mut opts = SearchOptions::default();
    let mut terms: Vec<String> = Vec::new();
    for part in raw.split_whitespace() {
        if let Some(v) = part.strip_prefix("folder:") {
            opts.folder = Some(v.to_string());
        } else if let Some(v) = part.strip_prefix("color:") {
            opts.color = Some(v.to_string());
        } else if let Some(v) = part.strip_prefix("modified:") {
            if let Ok(days) = v.trim_end_matches('d').parse::<u32>() {
                opts.modified_days = Some(days);
            }
        } else {
            terms.push(part.to_string());
        }
    }
    (terms.join(" "), opts)
}

fn score_hit(title: &str, body: &str, query: &str) -> i32 {
    let q = query.to_lowercase();
    let t = title.to_lowercase();
    if t == q {
        return 100;
    }
    if t.starts_with(&q) {
        return 80;
    }
    if t.contains(&q) {
        return 60;
    }
    if body.to_lowercase().contains(&q) {
        return 40;
    }
    0
}

fn snippet_from_body(body: &str, query: &str) -> Option<String> {
    let lower = body.to_lowercase();
    let q = query.to_lowercase();
    let pos = lower.find(&q)?;
    let start = lower[..pos].chars().count().saturating_sub(30);
    let excerpt: String = body.chars().skip(start).take(80).collect();
    Some(excerpt.replace('\n', " "))
}

fn search_hit(
    note: NoteSummary,
    q: &str,
    opts: &SearchOptions,
    now_ms: i64,
    read_body: impl FnOnce() -> Result<String, String>,
) -> Result<Option<SearchHit>, String> {
    if note.zone == "private" || note.color.as_deref() == Some("隐私") { return Ok(None); }
    if opts.color.as_ref().is_some_and(|color| note.color.as_ref() != Some(color)) { return Ok(None); }
    if opts.modified_days.is_some_and(|days| note.modified_ms < now_ms - i64::from(days) * 86_400_000) { return Ok(None); }
    let body = if q.is_empty() { String::new() } else { read_body()? };
    let score = if q.is_empty() { 10 } else { score_hit(&note.title, &body, q) };
    if score == 0 { return Ok(None); }
    let snippet = if q.is_empty() { None } else { snippet_from_body(&body, q) };
    Ok(Some(SearchHit { name: note.name, title: note.title, zone: note.zone,
        modified_ms: note.modified_ms, color: note.color, snippet, score }))
}

pub fn search_notes<R: Runtime>(
    app: &AppHandle<R>,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<SearchHit>, String> {
    let (text_query, parsed_opts) = parse_search_query(&query);
    let opts = SearchOptions {
        folder: options
            .as_ref()
            .and_then(|o| o.folder.clone())
            .or(parsed_opts.folder),
        color: options
            .as_ref()
            .and_then(|o| o.color.clone())
            .or(parsed_opts.color),
        modified_days: options
            .as_ref()
            .and_then(|o| o.modified_days)
            .or(parsed_opts.modified_days),
    };
    let q = text_query.trim();
    if q.is_empty() && opts.folder.is_none() && opts.color.is_none() && opts.modified_days.is_none()
    {
        return Ok(Vec::new());
    }

    let zones = notes::all_note_zones(app)?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let base = paths::writable_base(app)?;
    let config = crate::load_config()?;
    let colors = notes::load_note_color_meta_pub(&base)?;
    let mut hits: Vec<SearchHit> = Vec::new();

    for zone in zones {
        if let Some(ref folder) = opts.folder {
            if !zone_matches_filter(&zone, folder) {
                continue;
            }
        }
        let notes = notes::list_zone_at(&base, &config, zone.clone(), &colors)?;
        for note in notes {
            let name = note.name.clone();
            if let Some(hit) = search_hit(note, q, &opts, now_ms,
                || notes::read_note_at(&base, &config, zone.clone(), &name))? {
                hits.push(hit);
            }
        }
    }

    hits.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(b.modified_ms.cmp(&a.modified_ms))
    });
    hits.truncate(50);
    Ok(hits)
}

pub fn find_backlinks<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
) -> Result<Vec<NoteSummary>, String> {
    let zones = notes::all_note_zones(app)?;
    let patterns = [
        format!("[[{title}]]"),
        format!("[[{title}|"),
        format!("[[{title} "),
    ];
    let base = paths::writable_base(app)?;
    let config = crate::load_config()?;
    let colors = notes::load_note_color_meta_pub(&base)?;
    let mut out = Vec::new();
    for zone in zones {
        let notes = notes::list_zone_at(&base, &config, zone.clone(), &colors)?;
        for note in notes {
            if note.zone == "private" || note.color.as_deref() == Some("隐私") { continue; }
            let body = notes::read_note_at(&base, &config, zone.clone(), &note.name)?;
            if patterns.iter().any(|p| body.contains(p)) {
                out.push(note);
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_note(color: Option<&str>) -> NoteSummary {
        NoteSummary { name: "note.md".into(), title: "Example".into(), zone: "default".into(),
            modified_ms: 100, color: color.map(str::to_string) }
    }

    #[test]
    fn filter_only_search_does_not_read_note_bodies() {
        let hit = search_hit(fixture_note(Some("重要")), "", &SearchOptions::default(), 100,
            || Err("body should not be opened".into())).unwrap().unwrap();
        assert_eq!(hit.score, 10);
        assert!(hit.snippet.is_none());
    }

    #[test]
    fn private_and_filtered_notes_never_read_bodies() {
        for (color, filter) in [(Some("隐私"), None), (Some("重要"), Some("紧急"))] {
            assert!(search_hit(fixture_note(color), "secret", &SearchOptions { color: filter.map(str::to_string), ..Default::default() }, 100,
                || panic!("excluded body was read")).unwrap().is_none());
        }
    }

    #[test]
    fn text_search_keeps_ranking_and_snippets() {
        let hit = search_hit(fixture_note(None), "example", &SearchOptions::default(), 100,
            || Ok("an EXAMPLE body".into())).unwrap().unwrap();
        assert_eq!(hit.score, 100);
        assert_eq!(hit.snippet.as_deref(), Some("an EXAMPLE body"));
    }


    #[test]
    fn snippet_handles_case_mapping_that_changes_utf8_byte_length() {
        let result = std::panic::catch_unwind(|| snippet_from_body("İé", "é"));

        assert_eq!(result.unwrap(), Some("İé".to_string()));
    }
}
