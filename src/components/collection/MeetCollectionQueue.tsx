"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/features/workshare/contexts/auth";
import {
  ACQUISITION_STATES,
  IMPORT_STATES,
  MEET_CATEGORIES,
  MEET_QUEUE_PAGE_SIZE,
  type MeetQueuePatch,
  type MeetQueueResponse,
  type MeetQueueRow,
  type MeetParticipant,
} from "@/lib/collection/meet-queue";
import styles from "./MeetCollectionQueue.module.css";

const labels: Record<string, string> = {
  unknown: "Unknown",
  partial: "Partial",
  complete: "Complete",
  unchecked: "Unchecked",
  available: "Available",
  downloaded: "Downloaded",
  unavailable: "Unavailable",
  not_started: "Not started",
  prepared: "Prepared",
  partially_approved: "Partially approved",
  sanctioned: "Sanctioned",
  approved: "Approved",
  observed: "Observed",
  blocked: "Blocked",
  confirmed: "Confirmed IES",
  none: "No IES in documented scope",
  planned: "Planned attendance",
  entered: "Entered",
  recorded: "Recorded participation",
  not_checked: "Not checked",
  open_water: "Open water",
  pool: "Pool",
};
const defaultFilters = {
  year: "",
  team: "",
  ies: "",
  category: "",
  selected: "",
  progress: "",
};
type Filters = typeof defaultFilters;
type Draft = MeetQueuePatch & { blockersText: string };

function safeUrl(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function value(data: MeetQueueRow["data"], key: string) {
  return typeof data[key] === "string" ? (data[key] as string) : "";
}
function object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
function factText(input: unknown) {
  if (input === null || input === undefined) return "Unknown";
  if (typeof input === "string") return input || "(blank)";
  return JSON.stringify(input);
}
function dateLabel(date: string | null) {
  if (!date) return "Date unknown";
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf())
    ? date
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}
function draftFor(row: MeetQueueRow): Draft {
  return {
    meetId: row.id,
    selected: row.selected,
    priority: row.priority,
    notes: row.notes,
    blockers: row.blockers,
    blockersText: row.blockers.join("\n"),
    acquisitionState: row.acquisitionState,
    importState: row.importState,
    reconciliationNote: row.reconciliationNote,
    updatedAt: row.updatedAt,
  };
}
function remainingWork(row: MeetQueueRow) {
  const work: string[] = [];
  if (row.teamCoverage !== "complete")
    work.push(
      row.teamCoverage === "unknown"
        ? "Index participating teams"
        : "Resolve partial team coverage",
    );
  if (row.acquisitionState !== "downloaded")
    work.push(
      row.acquisitionState === "unavailable"
        ? "Find a results source"
        : "Acquire results",
    );
  if (row.importState !== "complete")
    work.push(
      row.importState === "partially_approved"
        ? "Finish approvals and reconcile exceptions"
        : row.importState === "prepared"
          ? "Review prepared results"
          : "Prepare full result import",
    );
  return work.length
    ? work.join(" · ")
    : "Reconciled for the documented result scope";
}

function SourceLink({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  const href = safeUrl(url);
  return href ? (
    <a
      className={styles.sourceLink}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  ) : (
    <span>{children}</span>
  );
}

function Participant({ team }: { team: MeetParticipant }) {
  return (
    <li className={styles.participant}>
      <div className={styles.participantHeading}>
        <strong>{team.name || team.clubCode || "Unresolved team"}</strong>
        <span
          className={team.basis === "recorded" ? styles.recorded : styles.badge}
        >
          {labels[team.basis]}
        </span>
      </div>
      <p className={styles.muted}>
        {team.representation === "school"
          ? "School representation"
          : team.representation === "unattached"
            ? "Unattached representation"
            : "Club representation"}
        {team.clubCode ? ` · ${team.clubCode}` : ""}
        {team.lscCode
          ? ` · ${team.representation === "school" ? "Supported club affiliation: " : "LSC: "}${team.lscCode}`
          : " · LSC affiliation unresolved"}
        {!team.catalogTeamId && !team.operationalTeamId
          ? " · Team identity unresolved"
          : ""}
      </p>
      {team.evidence.length ? (
        <details className={styles.evidence}>
          <summary>
            {team.evidence.length} source{" "}
            {team.evidence.length === 1 ? "reference" : "references"}
          </summary>
          <ul>
            {team.evidence.map((evidence, index) => (
              <li
                key={`${evidence.sourceUrl}-${evidence.member ?? ""}-${evidence.line ?? index}`}
              >
                <SourceLink url={evidence.sourceUrl}>
                  {evidence.kind || "Participation source"}
                </SourceLink>
                <span className={styles.muted}>
                  {evidence.member ? ` · ${evidence.member}` : ""}
                  {evidence.line ? ` · record ${evidence.line}` : ""}
                  {evidence.status ? ` · ${evidence.status}` : ""}
                </span>
                {evidence.sha256 ? (
                  <code className={styles.hash}>SHA-256 {evidence.sha256}</code>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className={styles.muted}>No source reference recorded.</p>
      )}
    </li>
  );
}

function MeetCard({
  row,
  draft,
  busy,
  locked,
  error,
  saved,
  onEdit,
  onSave,
  onDiscard,
}: {
  row: MeetQueueRow;
  draft?: Draft;
  busy: boolean;
  locked: boolean;
  error?: string;
  saved?: boolean;
  onEdit: (change: Partial<Draft>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDiscard: () => void;
}) {
  const current = draft ?? draftFor(row);
  const category =
    value(row.data, "category") || value(row.data, "meetCategory") || "unknown";
  const isCanceled = ["canceled", "cancelled"].includes(
    value(row.data, "status").toLowerCase(),
  );
  const location =
    value(row.data, "location") ||
    value(row.data, "venueName") ||
    value(row.data, "city");
  const course = value(row.data, "course");
  const sourceCourses = Array.isArray(row.data.sourceCourses)
    ? [
        ...new Set(
          row.data.sourceCourses.filter(
            (entry): entry is string =>
              typeof entry === "string" &&
              ["SCY", "LCM", "SCM"].includes(entry),
          ),
        ),
      ]
    : [];
  const discipline = value(row.data, "discipline");
  const host = value(row.data, "hostTeamName");
  const documents = Array.isArray(row.data.documents)
    ? row.data.documents
        .map(object)
        .filter((document) => typeof document.url === "string")
    : [];
  const aliases = Array.isArray(row.data.sourceAliases)
    ? row.data.sourceAliases
        .map(object)
        .filter((alias) => typeof alias.sourceUrl === "string")
    : [];
  const participationScope = value(row.data, "participationScope");
  const coverageNote = value(row.data, "coverageNote");
  const sourceIssues = [
    row.data.gaps,
    row.data.aliasConflicts,
    row.data.conflicts,
  ].flatMap((items) =>
    Array.isArray(items)
      ? items.filter((item): item is string => typeof item === "string")
      : [],
  );
  const catalogConflicts = Array.isArray(row.data.catalogConflicts)
    ? row.data.catalogConflicts.map(object)
    : [];
  const evidence = object(row.data.evidence);
  const participationCapture = object(evidence.participationCapture);
  const date =
    row.startsOn === row.endsOn || !row.endsOn
      ? dateLabel(row.startsOn)
      : `${dateLabel(row.startsOn)} – ${dateLabel(row.endsOn)}`;
  const recorded = row.participants.filter((team) => team.basis === "recorded");
  const ieTeams = recorded.filter((team) => team.lscCode === "IE");
  return (
    <article
      className={`${styles.meet} ${row.selected ? styles.selectedMeet : ""}`}
      aria-label={row.title}
      data-meet-id={row.id}
    >
      <div className={styles.meetHead}>
        <div className={styles.meetTitle}>
          <div className={styles.meta}>
            <span>{date}</span>
            <span>{labels[category] || category}</span>
            {isCanceled ? (
              <span className={styles.caution}>Canceled listing</span>
            ) : null}
          </div>
          <h2>{row.title}</h2>
          {location || course || discipline ? (
            <p className={styles.muted}>
              {[location, course, labels[discipline] || discipline]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {host ? <p className={styles.muted}>Host: {host}</p> : null}
          {sourceCourses.length ? (
            <p className={styles.muted}>
              Result courses: {sourceCourses.join(" · ")}
            </p>
          ) : null}
          {value(row.data, "catalogScope") === "national_lead" ? (
            <p className={styles.caution}>
              Outside IES
              {row.iesParticipation === "confirmed"
                ? " · confirmed IES participation"
                : " · participation unverified"}
            </p>
          ) : null}
          <p className={styles.participation}>
            <span
              className={
                row.iesParticipation === "confirmed"
                  ? styles.recorded
                  : styles.badge
              }
            >
              {row.iesParticipation === "unknown"
                ? "IES participation unknown"
                : labels[row.iesParticipation]}
            </span>
            <span>
              {recorded.length} recorded{" "}
              {recorded.length === 1 ? "team" : "teams"}
              {row.participants.length > recorded.length
                ? ` · ${row.participants.length - recorded.length} planned/entered`
                : ""}
            </span>
          </p>
          {ieTeams.length ? (
            <p className={styles.muted}>
              IES:{" "}
              {ieTeams.map((team) => team.name || team.clubCode).join(", ")}
            </p>
          ) : null}
        </div>
        <div className={styles.meetAside}>
          <span className={row.selected ? styles.requested : styles.muted}>
            {row.selected
              ? `Requested · priority ${row.priority}`
              : "Not selected"}
          </span>
          <SourceLink url={row.sourceUrl}>Meet source</SourceLink>
          <span className={styles.muted}>
            {row.importedSwims.toLocaleString()} imported individual swims
          </span>
        </div>
      </div>
      <dl className={styles.states}>
        <div>
          <dt>Team coverage</dt>
          <dd>
            {row.teamCoverage === "complete"
              ? "Complete for documented scope"
              : labels[row.teamCoverage]}
          </dd>
        </div>
        <div>
          <dt>Results acquisition</dt>
          <dd>{labels[row.acquisitionState]}</dd>
        </div>
        <div>
          <dt>Full import</dt>
          <dd>{labels[row.importState]}</dd>
        </div>
      </dl>
      <p className={styles.remaining}>
        <strong>Remaining:</strong> {remainingWork(row)}
      </p>
      {row.blockers.length ? (
        <p className={styles.caution}>
          <strong>Blockers:</strong> {row.blockers.join(" · ")}
        </p>
      ) : null}
      <details className={styles.meetDetails}>
        <summary>
          Teams, evidence & collection request
          {draft ? (
            <span className={styles.unsaved}>Unsaved changes</span>
          ) : saved ? (
            <span className={styles.saved}>Saved</span>
          ) : null}
        </summary>
        <div className={styles.detailGrid}>
          <div className={styles.teams}>
            <h3>Participating teams</h3>
            <p className={styles.muted}>
              Recorded participation confirms attendance. Entries and plans
              remain separate.{" "}
              {row.teamCoverage === "complete"
                ? "Coverage is complete only for the documented source scope."
                : "This index does not establish the absence of other teams."}
            </p>
            {participationScope ||
            coverageNote ||
            sourceIssues.length ||
            catalogConflicts.length ||
            sourceCourses.length ||
            documents.length ||
            aliases.length ? (
              <div className={styles.sourceContext}>
                {participationScope ? (
                  <p>
                    <strong>Documented participation scope:</strong>{" "}
                    {participationScope}
                  </p>
                ) : null}
                {sourceCourses.length ? (
                  <p>
                    <strong>Courses in captured results:</strong>{" "}
                    {sourceCourses.join(" · ")}. This list describes recorded
                    results in the supplied files; course coverage for the whole
                    meet remains limited to the documented source scope.
                  </p>
                ) : null}
                {documents.length || aliases.length ? (
                  <details className={styles.documents}>
                    <summary>Meet documents & identity sources</summary>
                    {documents.length ? (
                      <ul>
                        {documents.map((document, index) => (
                          <li key={`${String(document.url)}-${index}`}>
                            <SourceLink url={String(document.url)}>
                              {typeof document.name === "string"
                                ? document.name
                                : document.type === "results"
                                  ? "Results document"
                                  : "Meet document"}
                            </SourceLink>
                            <span className={styles.hint}>
                              {" "}
                              ·{" "}
                              {document.type === "results"
                                ? "Results"
                                : "Announcement / meet document"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {aliases.length ? (
                      <ul>
                        {aliases.map((alias, index) => (
                          <li key={`${String(alias.sourceUrl)}-${index}`}>
                            <SourceLink url={String(alias.sourceUrl)}>
                              Identity source
                              {typeof alias.sourceId === "string"
                                ? ` · ${alias.sourceId}`
                                : ""}
                            </SourceLink>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </details>
                ) : null}
                {coverageNote ? <p>{coverageNote}</p> : null}
                {sourceIssues.length ? (
                  <>
                    <h4>Source gaps and identity conflicts</h4>
                    <ul>
                      {sourceIssues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {catalogConflicts.length ? (
                  <>
                    <h4>Catalog field conflicts</h4>
                    <ul>
                      {catalogConflicts.map((conflict, index) => {
                        const field =
                          typeof conflict.field === "string"
                            ? conflict.field
                            : "Meet identity";
                        const source =
                          typeof conflict.sourceUrl === "string"
                            ? conflict.sourceUrl
                            : typeof participationCapture.sourceUrl === "string"
                              ? participationCapture.sourceUrl
                              : row.sourceUrl;
                        return (
                          <li key={`${field}-${index}`}>
                            <strong>{field}</strong>
                            <p>Reviewed value: {factText(conflict.approved)}</p>
                            <p>Source value: {factText(conflict.proposed)}</p>
                            <SourceLink url={source}>
                              Conflict source
                            </SourceLink>
                            {typeof conflict.note === "string" ? (
                              <p>{conflict.note}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {typeof evidence.sourceDateText === "string" ? (
                      <p>
                        <strong>Source date text:</strong>{" "}
                        {evidence.sourceDateText}
                      </p>
                    ) : null}
                    {typeof participationCapture.member === "string" ? (
                      <p>
                        <strong>Archive member:</strong>{" "}
                        {participationCapture.member}
                      </p>
                    ) : null}
                    {typeof participationCapture.sha256 === "string" ? (
                      <code className={styles.hash}>
                        SHA-256 {participationCapture.sha256}
                      </code>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            {row.participants.length ? (
              <ul className={styles.participants}>
                {row.participants.map((team) => (
                  <Participant key={team.id} team={team} />
                ))}
              </ul>
            ) : (
              <p className={styles.emptyTeams}>
                No participating teams indexed yet.
              </p>
            )}
            <p className={styles.identifier}>
              Catalog ID: <code>{row.id}</code>
            </p>
          </div>
          <form className={styles.requestForm} onSubmit={onSave}>
            <h3>Collection request</h3>
            <p className={styles.muted}>
              Save a request for an assisted collection run. Prepared data
              continues through staff review.
            </p>
            <label className={styles.checkbox}>
              <input
                aria-label="Select meet"
                type="checkbox"
                checked={current.selected}
                disabled={locked}
                onChange={(event) => onEdit({ selected: event.target.checked })}
              />
              Request full result import
            </label>
            <label className={styles.field}>
              Priority{" "}
              <span className={styles.hint}>
                Lower numbers come first (0–100)
              </span>
              <input
                aria-label="Priority"
                type="number"
                min={0}
                max={100}
                required
                value={current.priority}
                disabled={locked}
                onChange={(event) =>
                  onEdit({ priority: Number(event.target.value) })
                }
              />
            </label>
            <label className={styles.field}>
              Staff notes
              <textarea
                aria-label="Notes"
                maxLength={4000}
                rows={3}
                value={current.notes}
                disabled={locked}
                onChange={(event) => onEdit({ notes: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              Blockers{" "}
              <span className={styles.hint}>One per line, up to 30</span>
              <textarea
                aria-label="Blockers"
                maxLength={15000}
                rows={2}
                value={current.blockersText}
                disabled={locked}
                onChange={(event) =>
                  onEdit({ blockersText: event.target.value })
                }
              />
            </label>
            <div className={styles.formPair}>
              <label className={styles.field}>
                Results acquisition
                <select
                  aria-label="Acquisition state"
                  value={current.acquisitionState}
                  disabled={locked}
                  onChange={(event) =>
                    onEdit({
                      acquisitionState: event.target
                        .value as Draft["acquisitionState"],
                    })
                  }
                >
                  {ACQUISITION_STATES.map((state) => (
                    <option key={state} value={state}>
                      {labels[state]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Full import
                <select
                  aria-label="Import state"
                  value={current.importState}
                  disabled={locked}
                  onChange={(event) =>
                    onEdit({
                      importState: event.target.value as Draft["importState"],
                    })
                  }
                >
                  {IMPORT_STATES.map((state) => (
                    <option key={state} value={state}>
                      {labels[state]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              Reconciliation / exceptions note
              <span className={styles.hint}>
                Required to mark complete. Resolve blockers and account for
                approved results and retained exceptions.
              </span>
              <textarea
                aria-label="Reconciliation note"
                maxLength={4000}
                rows={3}
                value={current.reconciliationNote}
                disabled={locked}
                required={current.importState === "complete"}
                onChange={(event) =>
                  onEdit({ reconciliationNote: event.target.value })
                }
              />
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={locked || !draft}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              {draft ? (
                <button
                  className={styles.button}
                  type="button"
                  disabled={locked}
                  onClick={onDiscard}
                >
                  Load saved values
                </button>
              ) : null}
            </div>
            <p className={styles.hint}>
              Selecting or indexing a meet does not approve results or start a
              download.
            </p>
          </form>
        </div>
      </details>
    </article>
  );
}

export default function MeetCollectionQueue() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<MeetQueueResponse | null>(null);
  const [loadedParams, setLoadedParams] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const loadController = useRef<AbortController | null>(null);
  const params = new URLSearchParams({
    ...filters,
    search: query,
    offset: String(offset),
  }).toString();

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
      setLoading(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    if (!isAdmin || authLoading) return;
    const controller = new AbortController();
    loadController.current = controller;
    void fetch(`/api/collection/meets?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load the meet catalog.");
        if (controller.signal.aborted) return;
        setSnapshot(result as MeetQueueResponse);
        setLoadedParams(params);
        setError("");
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the meet catalog.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [isAdmin, authLoading, params, revision]);

  function filter(key: keyof Filters, next: string) {
    setFilters((current) => ({ ...current, [key]: next }));
    setOffset(0);
    setLoading(true);
  }
  function edit(row: MeetQueueRow, change: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] ?? draftFor(row)), ...change },
    }));
    setSaved((current) => ({ ...current, [row.id]: false }));
    setSaveErrors((current) => ({ ...current, [row.id]: "" }));
  }
  function discard(id: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSaveErrors((current) => ({ ...current, [id]: "" }));
  }
  async function save(row: MeetQueueRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = drafts[row.id];
    if (!draft || busy) return;
    const { blockersText, ...fields } = draft;
    const blockers = blockersText
      .split("\n")
      .map((text) => text.trim())
      .filter(Boolean);
    if (blockers.length > 30 || blockers.some((text) => text.length > 500)) {
      setSaveErrors((current) => ({
        ...current,
        [row.id]: "Use up to 30 blockers, each 500 characters or fewer.",
      }));
      return;
    }
    if (fields.importState === "complete" && blockers.length) {
      setSaveErrors((current) => ({
        ...current,
        [row.id]: "Resolve blockers before marking the import complete.",
      }));
      return;
    }
    setBusy(row.id);
    try {
      const response = await fetch("/api/collection/meets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, blockers }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          loadController.current?.abort();
          setRevision((current) => current + 1);
        }
        throw new Error(
          `${result.error || "Unable to save this meet."}${response.status === 409 ? " Your edits are preserved. Load saved values to use the latest version." : ""}`,
        );
      }
      loadController.current?.abort();
      discard(row.id);
      setSaved((current) => ({ ...current, [row.id]: true }));
      setRevision((current) => current + 1);
    } catch (cause) {
      setSaveErrors((current) => ({
        ...current,
        [row.id]:
          cause instanceof Error ? cause.message : "Unable to save this meet.",
      }));
    } finally {
      setBusy(null);
    }
  }
  async function exportSelected() {
    setExporting(true);
    setError("");
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.set("export", "1");
      exportParams.delete("offset");
      const response = await fetch(`/api/collection/meets?${exportParams}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error || "Unable to export collection requests.",
        );
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "selected-meet-collection-requests.json";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to export collection requests.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (authLoading)
    return (
      <main className={styles.page}>
        <p role="status">Checking your account…</p>
      </main>
    );
  if (!isAdmin)
    return (
      <main className={styles.page}>
        <h1>Meet collection</h1>
        <p>
          Staff access is required.{" "}
          <Link className={styles.sourceLink} href="/login">
            Sign in
          </Link>
        </p>
      </main>
    );

  const facets = snapshot?.facets;
  const summary = snapshot?.summary;
  const results = loadedParams === params ? snapshot : null;
  const resultsLoading = loading || query !== search.trim();
  const hasFilters = Boolean(query || Object.values(filters).some(Boolean));
  const draftCount = Object.keys(drafts).length;
  return (
    <main className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <Link className={styles.backLink} href="/tools/review">
            <ArrowLeft size={15} aria-hidden="true" />
            Collection review
          </Link>
          <h1>Meet collection</h1>
          <p>
            Index participating teams, choose meets, and track full result
            imports.
          </p>
        </div>
        <span className={styles.staffLabel}>
          <ShieldCheck size={16} aria-hidden="true" />
          Staff workspace
        </span>
      </div>
      <div className={styles.intro}>
        Start with historical Inland Empire meets, then expand to meets with
        evidence of IES participation. Requests, priorities, and notes are
        private to staff.
      </div>
      {summary ? (
        <dl className={styles.summary}>
          {[
            ["Catalog meets", summary.total],
            ["Confirmed IES", summary.confirmedIES],
            ["Requested", summary.selected],
            ["Unfinished imports", summary.unfinished],
          ].map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{Number(count).toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <section className={styles.queue} aria-label="Meet collection queue">
        <div className={styles.filters}>
          <label className={`${styles.field} ${styles.search}`}>
            Search all meets
            <input
              type="search"
              maxLength={200}
              placeholder="Meet, team, source, or collection note…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Year
            <select
              value={filters.year}
              onChange={(event) => filter("year", event.target.value)}
            >
              <option value="">All years</option>
              {facets?.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Participating team
            <select
              value={filters.team}
              onChange={(event) => filter("team", event.target.value)}
            >
              <option value="">All teams</option>
              {facets?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            IES participation
            <select
              value={filters.ies}
              onChange={(event) => filter("ies", event.target.value)}
            >
              <option value="">Any evidence</option>
              <option value="confirmed">Confirmed IES</option>
              <option value="unknown">Unknown</option>
              <option value="none">No IES in documented scope</option>
            </select>
          </label>
          <label className={styles.field}>
            Meet category
            <select
              value={filters.category}
              onChange={(event) => filter("category", event.target.value)}
            >
              <option value="">All categories</option>
              {MEET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {labels[category]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Collection request
            <select
              value={filters.selected}
              onChange={(event) => filter("selected", event.target.value)}
            >
              <option value="">All meets</option>
              <option value="true">Requested</option>
              <option value="false">Not selected</option>
            </select>
          </label>
          <label className={styles.field}>
            Full import progress
            <select
              value={filters.progress}
              onChange={(event) => filter("progress", event.target.value)}
            >
              <option value="">Any progress</option>
              {[...IMPORT_STATES, "blocked"].map((state) => (
                <option key={state} value={state}>
                  {labels[state]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.toolbar}>
          <p role="status">
            {resultsLoading
              ? "Loading catalog…"
              : results
                ? `${results.total.toLocaleString()} matching meets`
                : "Catalog could not be loaded."}
            <span className={styles.hint}>
              {" "}
              · Search and filters cover the full catalog.
            </span>
          </p>
          <div className={styles.actions}>
            {hasFilters ? (
              <button
                className={styles.button}
                onClick={() => {
                  setSearch("");
                  setQuery("");
                  setFilters(defaultFilters);
                  setOffset(0);
                  setLoading(true);
                }}
              >
                Clear filters
              </button>
            ) : null}
            <button
              className={styles.button}
              disabled={resultsLoading}
              onClick={() => {
                setLoading(true);
                setRevision((current) => current + 1);
              }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </button>
            <button
              className={styles.button}
              disabled={exporting || resultsLoading || !results}
              onClick={() => void exportSelected()}
            >
              <Download size={14} aria-hidden="true" />
              {exporting ? "Exporting…" : "Export selected requests"}
            </button>
          </div>
        </div>
        <p className={styles.orderNote}>
          Selected priorities first, then unfinished meets with confirmed IES
          participation and ready results; newest first. Export includes saved
          selections matching these filters.
        </p>
        {draftCount ? (
          <p className={styles.draftNote} role="status">
            {draftCount} {draftCount === 1 ? "meet has" : "meets have"} unsaved
            changes. Refreshing or filtering preserves your edits in this
            session.
          </p>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}{" "}
            <button
              className={styles.button}
              onClick={() => {
                setLoading(true);
                setRevision((current) => current + 1);
              }}
            >
              Try again
            </button>
          </p>
        ) : null}
        {resultsLoading ? (
          <p className={styles.loading} role="status">
            Loading meets…
          </p>
        ) : null}
        {!resultsLoading && results ? (
          <div className={styles.meetList}>
            {results.rows.length ? (
              results.rows.map((row) => (
                <MeetCard
                  key={row.id}
                  row={row}
                  draft={drafts[row.id]}
                  busy={busy === row.id}
                  locked={busy !== null}
                  error={saveErrors[row.id]}
                  saved={saved[row.id]}
                  onEdit={(change) => edit(row, change)}
                  onSave={(event) => void save(row, event)}
                  onDiscard={() => discard(row.id)}
                />
              ))
            ) : (
              <div className={styles.empty}>
                <h2>
                  {hasFilters
                    ? "No meets match these filters"
                    : "No approved meets in the catalog yet"}
                </h2>
                <p>
                  {hasFilters
                    ? "Try another year, team, or participation state."
                    : "Meet discoveries will appear here after staff review."}
                </p>
              </div>
            )}
          </div>
        ) : null}
        <nav className={styles.pager} aria-label="Meet pages">
          <button
            className={styles.button}
            disabled={resultsLoading || offset === 0}
            onClick={() => {
              setOffset((current) =>
                Math.max(0, current - MEET_QUEUE_PAGE_SIZE),
              );
              setLoading(true);
            }}
          >
            Previous
          </button>
          <span>
            {results?.total
              ? `${offset + 1}–${Math.min(offset + results.rows.length, results.total)} of ${results.total.toLocaleString()}`
              : "0 meets"}
          </span>
          <button
            className={styles.button}
            disabled={resultsLoading || !results?.hasNext}
            onClick={() => {
              setOffset((current) => current + MEET_QUEUE_PAGE_SIZE);
              setLoading(true);
            }}
          >
            Next
          </button>
        </nav>
      </section>
      <details className={styles.ledger}>
        <summary>
          Historical coverage ledger
          <span>{snapshot?.coverage.length ?? 0} source windows</span>
        </summary>
        <p className={styles.muted}>
          A checked source window describes what was searched. Partial archives
          and unresolved gaps remain visible.
        </p>
        {snapshot?.coverage.length ? (
          <ul>
            {snapshot.coverage.map((entry) => (
              <li key={entry.id}>
                <div className={styles.ledgerHead}>
                  <strong>
                    {entry.year} · {labels[entry.category]}
                  </strong>
                  <span
                    className={
                      entry.status === "blocked" ? styles.caution : styles.badge
                    }
                  >
                    {labels[entry.status]}
                  </span>
                </div>
                <p>{entry.scope}</p>
                <p className={styles.muted}>
                  {entry.meet_count} meets found · Checked{" "}
                  {dateLabel(entry.checked_at)} ·{" "}
                  <SourceLink url={entry.source_url}>Source</SourceLink>
                </p>
                {entry.gaps.length ? (
                  <ul className={styles.gaps}>
                    {entry.gaps.map((gap, index) => (
                      <li key={index}>{gap}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyTeams}>
            No source windows have been logged yet.
          </p>
        )}
      </details>
    </main>
  );
}
