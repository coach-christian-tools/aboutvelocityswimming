import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import { InventoryField, InventoryTable } from "./ImportsInventory";
import styles from "./ImportsInventory.module.css";
import review from "./ImportsReview.module.css";
import {
  importPageSize,
  importQueuePage,
  type ImportMatch,
  type ImportQueuePage,
  type ImportQueueRow,
  type ImportTableKind,
} from "./imports-review-api";
import { eventLabel } from "./times-data";

export type ImportTableSelection = {
  ids: Set<string>;
  excluded: Set<string>;
  snapshot: { id: string; count: number } | null;
};

type Query = { search: string; batchId: string; offset: number };

const initialQuery = { search: "", batchId: "", offset: 0 };
const meetColumns = ["Meet", "Date", "Type", "Course", "Review", "Source"];
const swimColumns = ["Swimmer / relay", "Date", "Meet", "Team", "Event", "Course", "Round", "Time", "Result", "Review", "Source"];

function isSelected(row: ImportQueueRow, selection: ImportTableSelection) {
  return selection.ids.has(row.id) || (row.selected && !selection.excluded.has(row.id));
}

function PageCheckbox({ kind, checked, partial, disabled, onChange }: {
  kind: ImportTableKind;
  checked: boolean;
  partial: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      ref={input}
      type="checkbox"
      aria-label={`Select all ${kind} on this page`}
      aria-checked={partial ? "mixed" : checked}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

function TextCell({ value }: { value: string | null }) {
  return <span className={styles.cellText} title={value || undefined}>{value || "—"}</span>;
}

function ImportRow({ row, selected, disabled, onSelect, onDetails }: {
  row: ImportQueueRow;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onDetails: () => void;
}) {
  const meet = row.kind === "meet" || row.kind === "catalog_meet";
  return (
    <tr>
      <th scope="row">
        <label className={review.rowName}>
          <input
            type="checkbox"
            aria-label={`Select ${row.label}`}
            checked={selected}
            disabled={disabled}
            onChange={(event) => onSelect(event.currentTarget.checked)}
          />
          <TextCell value={row.label} />
        </label>
      </th>
      <td className={styles.numeric}>{row.startsOn || "—"}</td>
      {meet ? (
        <>
          <td>{row.kind === "catalog_meet" ? "Catalog" : "Results"}</td>
          <td>{row.course || "—"}</td>
        </>
      ) : (
        <>
          <td><TextCell value={row.meetName || row.meetId} /></td>
          <td><TextCell value={row.teamName} /></td>
          <td><TextCell value={row.eventCode ? eventLabel(row.eventCode) : null} /></td>
          <td>{row.course || "—"}</td>
          <td>{row.round || "—"}</td>
          <td className={styles.numeric}>{formatSwimTime(row.time !== null && row.time > 0 ? row.time : null)}</td>
          <td>{row.resultStatus || "—"}</td>
        </>
      )}
      <td className={row.blocker ? styles.missing : styles.muted}><TextCell value={row.blocker || "Pending"} /></td>
      <td>
        <button type="button" aria-label={`View details for ${row.label}`} onClick={onDetails}>Details</button>
      </td>
    </tr>
  );
}

export function importSelectionCount(selection: ImportTableSelection) {
  return (selection.snapshot?.count ?? 0) + selection.ids.size - selection.excluded.size;
}

export function ImportReviewTable({ kind, selection, revision, busy, onSelection, onMatch, onDetails }: {
  kind: ImportTableKind;
  selection: ImportTableSelection;
  revision: number;
  busy: boolean;
  onSelection: (selection: ImportTableSelection) => void;
  onMatch: (match: ImportMatch) => void;
  onDetails: (row: ImportQueueRow) => void;
}) {
  const [query, setQuery] = useState<Query>(initialQuery);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; page?: ImportQueuePage; error?: string }>();
  const params = new URLSearchParams({
    kind,
    offset: String(query.offset),
  });
  if (query.search) params.set("search", query.search);
  if (query.batchId) params.set("batchId", query.batchId);
  if (selection.snapshot) params.set("selectionId", selection.snapshot.id);
  const request = params.toString();
  const key = `${revision}/${retry}/${request}`;

  useEffect(() => {
    const controller = new AbortController();
    void importQueuePage(new URLSearchParams(request), controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setLoaded({ key, page });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: error instanceof Error ? error.message : "The queue could not be loaded." });
      },
    );
    return () => controller.abort();
  }, [key, request]);

  const response = loaded?.key === key ? loaded : undefined;
  const page = response?.page;
  const rows = page?.rows ?? [];
  const title = kind === "meets" ? "Meets" : "Swims";
  const checked = rows.filter((row) => isSelected(row, selection)).length;
  const count = importSelectionCount(selection);

  function updateSelection(records: ImportQueueRow[], select: boolean) {
    const ids = new Set(selection.ids);
    const excluded = new Set(selection.excluded);
    for (const row of records) {
      if (row.selected) {
        if (select) excluded.delete(row.id);
        else excluded.add(row.id);
      } else if (select) {
        ids.add(row.id);
      } else {
        ids.delete(row.id);
      }
    }
    onSelection({ ...selection, ids, excluded });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setQuery({ offset: 0, search: String(form.get("search") ?? "").trim(), batchId: String(form.get("batchId") ?? "").trim() });
  }

  return (
    <section className={review.section} aria-labelledby={`import-${kind}`}>
      <h2 id={`import-${kind}`}>{title}</h2>
      <form onSubmit={applyFilters} onReset={() => setQuery(initialQuery)} aria-label={`Filter pending ${kind}`}>
        <fieldset className={styles.filters} disabled={busy}>
          <legend className="sr-only">{title} filters</legend>
          <InventoryField label={`Search ${kind}`}>
            <input type="search" name="search" maxLength={200} placeholder={kind === "meets" ? "Meet name or ID" : "Swimmer, meet, or event code"} />
          </InventoryField>
          <InventoryField label="Batch ID">
            <input type="text" name="batchId" maxLength={36} />
          </InventoryField>
          <div className={styles.filterActions}>
            <button type="submit">Apply filters</button>
            <button type="reset">Clear filters</button>
          </div>
        </fieldset>
      </form>
      <div className={review.selection} aria-live="polite">
        <button type="button" disabled={busy || !page?.total} onClick={() => onMatch({ kind, search: query.search || undefined, batchId: query.batchId || undefined })}>
          {page?.total ? `Select all ${page.total.toLocaleString()} matching ${kind}` : "Select all matching"}
        </button>
        {count > 0 && (
          <>
            <span>{count.toLocaleString()} selected</span>
            <button type="button" disabled={busy} onClick={() => onSelection({ ids: new Set(), excluded: new Set(), snapshot: null })}>
              Clear {kind} selection
            </button>
          </>
        )}
      </div>
      {!response && <p role="status" className={styles.notice}>Loading {kind}…</p>}
      {response?.error && <p role="alert" className={styles.notice}>{response.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
      {page && (
        <>
          <InventoryTable
            label={`Pending ${kind}`}
            columns={kind === "meets" ? meetColumns : swimColumns}
            firstColumnControl={<PageCheckbox
              kind={kind}
              checked={rows.length > 0 && checked === rows.length}
              partial={checked > 0 && checked < rows.length}
              disabled={busy || rows.length === 0}
              onChange={(select) => updateSelection(rows, select)}
            />}
            empty={rows.length ? undefined : `No pending ${kind} match these filters.`}
          >
            {rows.map((row) => (
              <ImportRow
                key={row.id}
                row={row}
                selected={isSelected(row, selection)}
                disabled={busy}
                onSelect={(select) => updateSelection([row], select)}
                onDetails={() => onDetails(row)}
              />
            ))}
          </InventoryTable>
          <div className={styles.pagination}>
            <p>Showing {rows.length ? `${(query.offset + 1).toLocaleString()}–${(query.offset + rows.length).toLocaleString()}` : "0"} of {page.total.toLocaleString()} rows</p>
            {(query.offset > 0 || page.hasNext) && (
              <nav aria-label={`${title} pages`}>
                <button type="button" disabled={query.offset === 0 || busy} onClick={() => setQuery({ ...query, offset: query.offset - importPageSize })}>Previous</button>
                <button type="button" disabled={!page.hasNext || busy} onClick={() => setQuery({ ...query, offset: query.offset + importPageSize })}>Next</button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}
