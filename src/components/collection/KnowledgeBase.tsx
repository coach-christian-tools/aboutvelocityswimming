"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import { field, originalSource, reviewedDate, type WikiEntry } from "./wiki";
import styles from "./KnowledgeBase.module.css";
const tabs = [{ id: "team", label: "Teams" }, { id: "meet", label: "Meets" }, { id: "document", label: "Documents" }, { id: "organization", label: "Organizations" }] as const;
type Tab = typeof tabs[number]["id"];
function Chips({ label, entries, selected, onChange }: { label: string; entries: WikiEntry[]; selected: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className={styles.chips}><legend>{label}</legend>
    <button type="button" aria-pressed={!selected.length} onClick={() => onChange([])}>All</button>
    {entries.map(entry => <button type="button" key={entry.id} aria-pressed={selected.includes(entry.id)} onClick={() => onChange(selected.includes(entry.id) ? selected.filter(id => id !== entry.id) : [...selected, entry.id])}>{entry.title}</button>)}
    {!entries.length && <span className={styles.hint}>No approved {label.toLowerCase()} yet.</span>}
  </fieldset>;
}
export default function KnowledgeBase() {
  const [tab, setTab] = useState<Tab>("team");
  const [organization, setOrganization] = useState("zone");
  const [facets, setFacets] = useState<WikiEntry[]>([]);
  const [facetError, setFacetError] = useState("");
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [lscs, setLscs] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [venue, setVenue] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const invalidDates = Boolean(from && until && from > until);
  useEffect(() => { if (query === search.trim()) return; const timer = setTimeout(() => { setQuery(search.trim()); setOffset(0); setLoading(true); }, 250); return () => clearTimeout(timer); }, [search, query]);
  useEffect(() => {
    let active = true;
    if (!hasBackendConfiguration) return;
    async function loadFacets() {
      const all: WikiEntry[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await browserClient().from("knowledge_entries").select("*").in("kind", ["zone", "lsc", "region", "venue"]).order("id").range(start, start + 499);
        if (!active) return;
        if (error) { setFacetError("Filters could not be loaded. Try again."); return; }
        all.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      setFacets(all.sort((a, b) => a.title.localeCompare(b.title))); setFacetError("");
    }
    void loadFacets();
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true;
    if (!hasBackendConfiguration || invalidDates) return;
    let request = browserClient().from("knowledge_entries").select("*").eq("kind", tab === "organization" ? organization : tab);
    if (query) request = request.ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
    if (tab === "team" || tab === "meet") {
      if (zones.length) request = request.in("data->>zoneId", zones);
      if (lscs.length) request = request.in("data->>lscId", lscs);
    }
    if (tab === "meet") {
      if (region) request = request.eq("data->>regionId", region);
      if (venue) request = request.eq("data->>venueId", venue);
      if (from) request = request.or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`);
      if (until) request = request.lte("starts_on", until);
    }
    if (tab === "meet") request = request.order("starts_on", { ascending: true, nullsFirst: false });
    void request.order("title").order("id").range(offset, offset + 24).then(({ data, error }) => {
      if (!active) return;
      setEntries((data ?? []).slice(0, 24)); setHasNext((data?.length ?? 0) > 24); setError(error?.message ?? ""); setLoading(false);
    });
    return () => { active = false; };
  }, [tab, organization, zones, lscs, region, venue, from, until, query, offset, invalidDates, revision]);
  function resetPage() { setOffset(0); setLoading(true); }
  function clear() { setZones([]); setLscs([]); setRegion(""); setVenue(""); setFrom(""); setUntil(""); setSearch(""); setQuery(""); resetPage(); }
  const availableLscs = facets.filter(entry => entry.kind === "lsc" && (!zones.length || zones.includes(field(entry.data, "zoneId"))));
  const activeFilters = Boolean(search || zones.length || lscs.length || region || venue || from || until);
  return <section className={styles.wiki}>
    <p className={styles.intro}>Explore the swimming community through reviewed information and original sources.</p>
    <div className={styles.tabs} role="tablist" aria-label="Wiki sections">
      {tabs.map(item => <button key={item.id} id={`wiki-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="wiki-panel" tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = tabs.findIndex(item => item.id === tab);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        setTab(tabs[next].id); clear(); document.getElementById(`wiki-tab-${tabs[next].id}`)?.focus();
      }} onClick={() => { setTab(item.id); clear(); }}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id="wiki-panel" aria-labelledby={`wiki-tab-${tab}`} className={styles.panel}>
      <div className={styles.filters}>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search {tab === "organization" ? "organizations" : `${tab}s`}</span><input type="search" placeholder={`Search ${tab === "organization" ? "organizations" : `${tab}s`}…`} value={search} onChange={event => setSearch(event.target.value)} /></label>
        {(tab === "team" || tab === "meet") && <>
          <Chips label="Zones" entries={facets.filter(entry => entry.kind === "zone")} selected={zones} onChange={value => { setZones(value); setLscs([]); resetPage(); }} />
          <Chips label="LSCs" entries={availableLscs} selected={lscs} onChange={value => { setLscs(value); resetPage(); }} />
        </>}
        {tab === "meet" && <div className={styles.selects}>
          <label>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); resetPage(); }} /></label>
          <label>Through<input type="date" value={until} onChange={event => { setUntil(event.target.value); resetPage(); }} /></label>
          {[{ label: "Region", kind: "region", value: region, setter: setRegion }, { label: "Venue", kind: "venue", value: venue, setter: setVenue }].map(filter => <label key={filter.kind}>{filter.label}<select value={filter.value} onChange={event => { filter.setter(event.target.value); resetPage(); }}><option value="">All {filter.kind}s</option>{facets.filter(entry => entry.kind === filter.kind).map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>)}
        </div>}
        {tab === "organization" && <label className={styles.organization}>Organization type<select value={organization} onChange={event => { setOrganization(event.target.value); resetPage(); }}>{[["zone", "Zones"], ["lsc", "LSCs"], ["region", "Regions"], ["venue", "Venues"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {activeFilters && <button className={styles.clear} onClick={clear}>Clear filters</button>}
      </div>
      {facetError && <p role="alert">{facetError} <button onClick={() => setRevision(value => value + 1)}>Retry filters</button></p>}
      {!hasBackendConfiguration ? <p className={styles.empty}>The database is being connected.</p> : invalidDates ? <p role="alert">The end date must be on or after the start date.</p> : error ? <p role="alert">{error} <button onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Try again</button></p> : loading ? <p className={styles.empty} role="status">Loading…</p> : <>
        <p className={styles.count} role="status">{entries.length ? `${entries.length} entries · Page ${offset / 24 + 1}` : activeFilters ? "No entries match these filters." : "No approved entries yet."}</p>
        <div className={styles.cards}>{entries.map(entry => {
          const source = originalSource(entry);
          return <article key={entry.id} className={styles.card}>
            <div className={styles.cardTop}><h2 aria-label={entry.title}>{entry.title}{source && <a className={styles.source} href={source} target="_blank" rel="noopener noreferrer" aria-label={`Original source for ${entry.title}`} title={source}><ExternalLink size={18} aria-hidden="true" /></a>}</h2><time className={styles.reviewed} dateTime={entry.updated_at}>Reviewed {reviewedDate(entry.updated_at)}</time></div>
            {entry.starts_on && <p className={styles.dates}>{entry.starts_on}{entry.ends_on && entry.ends_on !== entry.starts_on ? ` – ${entry.ends_on}` : ""}</p>}
            {field(entry.data, "summary") && <p>{field(entry.data, "summary")}</p>}
            {field(entry.data, "geographicCoverage") && <p className={styles.geography}>{field(entry.data, "geographicCoverage")}</p>}
            {entry.kind === "team" && <div className={styles.tags}>{[field(entry.data, "zoneId"), field(entry.data, "lscId")].filter(Boolean).map(id => { const parent = facets.find(item => item.id === id); return parent ? <span key={id}>{parent.title}</span> : null; })}</div>}
          </article>;
        })}</div>
      </>}
      <nav aria-label="Knowledge pages" className={styles.pagination}><button disabled={!offset || loading || invalidDates} onClick={() => { setOffset(offset - 24); setLoading(true); }}>Previous</button><button disabled={!hasNext || loading || invalidDates} onClick={() => { setOffset(offset + 24); setLoading(true); }}>Next</button></nav>
    </div>
  </section>;
}
