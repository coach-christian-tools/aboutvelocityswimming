"use client";
import { useEffect, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { Building2, CalendarDays, ExternalLink, Files, Map, Search, Users } from "lucide-react";
import ToolSidebar, { ToolSidebarItem } from "@/components/shared/ToolSidebar";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import AtlasSectionGuide, { atlasTopSection } from "./AtlasSectionGuide";
import { field, originalSource, reviewedDate, type WikiEntry } from "./wiki";
import styles from "./KnowledgeBase.module.css";
const MapExplorer = dynamic(() => import("./map/MapExplorer"), { loading: () => <p role="status">Loading map explorer…</p> });
const tabs = [
  { id: "map", label: "Map", icon: Map },
  { id: "team", label: "Teams", icon: Users },
  { id: "meet", label: "Meets", icon: CalendarDays },
  { id: "document", label: "Documents", icon: Files },
  { id: "organization", label: "Organizations", icon: Building2 },
] as const;
type Tab = typeof tabs[number]["id"];
const directorySections = [atlasTopSection, { id: "atlas-filters", label: "Filters" }, { id: "atlas-results", label: "Results" }];
function Chips({ label, entries, selected, onChange, initialLimit }: { label: string; entries: WikiEntry[]; selected: string[]; onChange: (value: string[]) => void; initialLimit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEntries = initialLimit && !expanded ? entries.slice(0, initialLimit) : entries;
  return <fieldset className={styles.chips}><legend>{label}</legend>
    <button type="button" aria-pressed={!selected.length} onClick={() => onChange([])}>All</button>
    {visibleEntries.map(entry => <button type="button" key={entry.id} aria-pressed={selected.includes(entry.id)} onClick={() => onChange(selected.includes(entry.id) ? selected.filter(id => id !== entry.id) : [...selected, entry.id])}>{entry.title}</button>)}
    {initialLimit && entries.length > initialLimit ? <button type="button" className={styles.chipToggle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show all"}</button> : null}
    {!entries.length && <span className={styles.hint}>No approved {label.toLowerCase()} yet.</span>}
  </fieldset>;
}
export default function KnowledgeBase() {
  const [tab, setTab] = useState<Tab>("map");
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
    if (!hasBackendConfiguration || invalidDates || tab === "map") return;
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
  function selectTab(next: Tab) {
    setTab(next);
    clear();
  }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = tabs[nextIndex].id;
    selectTab(next);
    document.getElementById(`wiki-tab-${next}`)?.focus();
  }
  const availableLscs = facets.filter(entry => entry.kind === "lsc" && (!zones.length || zones.includes(field(entry.data, "zoneId"))));
  const activeFilters = Boolean(search || zones.length || lscs.length || region || venue || from || until);
  const navigation = (
    <div role="tablist" aria-label="Swim Atlas sections" aria-orientation="vertical">
      {tabs.map((item, index) => (
        <ToolSidebarItem
          key={item.id}
          id={`wiki-tab-${item.id}`}
          type="button"
          role="tab"
          icon={item.icon}
          active={tab === item.id}
          aria-selected={tab === item.id}
          aria-controls="wiki-panel"
          tabIndex={tab === item.id ? 0 : -1}
          onKeyDown={event => navigateTabs(event, index)}
          onClick={() => selectTab(item.id)}
        >
          {item.label}
        </ToolSidebarItem>
      ))}
    </div>
  );
  const panel = (
    <div role="tabpanel" id="wiki-panel" aria-labelledby={`wiki-tab-${tab}`} className={styles.panel} tabIndex={0}>
      {tab === "map" && facetError && <p role="alert">{facetError} <button onClick={() => setRevision(value => value + 1)}>Retry filters</button></p>}
      {tab === "map" ? <MapExplorer facets={facets} /> : <AtlasSectionGuide sections={directorySections}>
      <section id="atlas-filters" aria-label="Filters" tabIndex={-1} data-atlas-section className={styles.filters}>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search {tab === "organization" ? "organizations" : `${tab}s`}</span><input type="search" placeholder={`Search ${tab === "organization" ? "organizations" : `${tab}s`}…`} value={search} onChange={event => setSearch(event.target.value)} /></label>
        {(tab === "team" || tab === "meet") && <>
          <Chips label="Zones" entries={facets.filter(entry => entry.kind === "zone")} selected={zones} onChange={value => { setZones(value); setLscs([]); resetPage(); }} />
          <Chips label="LSCs" entries={availableLscs} selected={lscs} initialLimit={3} onChange={value => { setLscs(value); resetPage(); }} />
        </>}
        {tab === "meet" && <div className={styles.selects}>
          <label>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); resetPage(); }} /></label>
          <label>Through<input type="date" value={until} onChange={event => { setUntil(event.target.value); resetPage(); }} /></label>
          {[{ label: "Region", kind: "region", value: region, setter: setRegion }, { label: "Venue", kind: "venue", value: venue, setter: setVenue }].map(filter => <label key={filter.kind}>{filter.label}<select value={filter.value} onChange={event => { filter.setter(event.target.value); resetPage(); }}><option value="">All {filter.kind}s</option>{facets.filter(entry => entry.kind === filter.kind).map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>)}
        </div>}
        {tab === "organization" && <label className={styles.organization}>Organization type<select value={organization} onChange={event => { setOrganization(event.target.value); resetPage(); }}>{[["zone", "Zones"], ["lsc", "LSCs"], ["region", "Regions"], ["venue", "Venues"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {activeFilters && <button className={styles.clear} onClick={clear}>Clear filters</button>}
      </section>
      <section id="atlas-results" aria-label="Results" tabIndex={-1} data-atlas-section>
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
      </section>
      </AtlasSectionGuide>}
    </div>
  );
  return (
    <ToolSidebar tool="atlas" navigationLabel="Swim Atlas navigation" storageKey="swim-atlas-sidebar" navigation={navigation}>
      <main className={styles.wiki}>
        <div className={styles.content}>
          <h1 id={atlasTopSection.id} tabIndex={-1} className="text-3xl font-semibold">Swim Atlas</h1>
          <p className={styles.intro}>Explore the swimming community through reviewed information and original sources.</p>
          {panel}
        </div>
      </main>
    </ToolSidebar>
  );
}
