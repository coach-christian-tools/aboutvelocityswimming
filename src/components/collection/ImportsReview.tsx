"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ImportReviewTable, importSelectionCount, type ImportTableSelection } from "./ImportReviewTable";
import ImportSwimmerMatch from "./ImportSwimmerMatch";
import {
  approveImportSelection,
  createImportSelection,
  ImportRequestError,
  importPageSize,
  importPreviewPage,
  importQueueDetail,
  importQueuePage,
  type ImportApprovalReceipt,
  type ImportMatch,
  type ImportPreviewItem,
  type ImportPreviewSection,
  type ImportQueueDetail,
  type ImportQueuePage,
  type ImportQueueRow,
  type ImportSelectionPreview,
  type ImportSwimmerResolution,
  type ImportTableKind,
} from "./imports-review-api";
import { clearTimesCache } from "./times-cache";
import styles from "./ImportsReview.module.css";

const savedApprovalKey = "velocity-import-approval";

function readSavedApproval() {
  try {
    return sessionStorage.getItem(savedApprovalKey);
  } catch {
    return null;
  }
}

function writeSavedApproval(selectionId: string | null) {
  try {
    if (selectionId) sessionStorage.setItem(savedApprovalKey, selectionId);
    else sessionStorage.removeItem(savedApprovalKey);
  } catch {
    // Keep the selection in memory if browser storage is unavailable.
  }
  window.dispatchEvent(new Event(savedApprovalKey));
}

function subscribeToSavedApproval(listener: () => void) {
  window.addEventListener(savedApprovalKey, listener);
  return () => window.removeEventListener(savedApprovalKey, listener);
}

function emptySelection(): ImportTableSelection {
  return { ids: new Set(), excluded: new Set(), snapshot: null };
}

function emptySelections() {
  return { meets: emptySelection(), swims: emptySelection() };
}

function selectionInput(selections: ImportTableSelection[]) {
  return {
    ids: selections.flatMap((selection) => [...selection.ids]),
    excludeIds: selections.flatMap((selection) => [...selection.excluded]),
    selectionIds: selections.flatMap((selection) => selection.snapshot ? [selection.snapshot.id] : []),
  };
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function SourceLink({ value }: { value: string }) {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    // A non-URL source reference still has value as text.
  }
  if (url && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password) {
    return <a href={url.href} target="_blank" rel="noopener noreferrer">{value}</a>;
  }
  return <span>{value || "—"}</span>;
}

function ReviewDialog({ title, children, onClose, closeDisabled = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <div className={styles.dialogHeading}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={onClose} disabled={closeDisabled}>Close</button>
      </div>
      {children}
    </dialog>
  );
}

function ImportDetail({ row, canResolve, clearsSelection, onClose, onResolved }: {
  row: ImportQueueRow;
  canResolve: boolean;
  clearsSelection: boolean;
  onClose: () => void;
  onResolved: (resolution: ImportSwimmerResolution) => void;
}) {
  const [detail, setDetail] = useState<ImportQueueDetail>();
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void importQueueDetail(row.id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setDetail(data);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(errorText(failure, "The source details could not be loaded."));
      },
    );
    return () => controller.abort();
  }, [row.id]);
  const blocker = detail ? detail.blocker : row.blocker;
  return (
    <ReviewDialog title={row.label} onClose={onClose} closeDisabled={saving}>
      {blocker && <p className={styles.blocker}>{blocker}</p>}
      {error && <p role="alert">{error}</p>}
      {!detail && !error && <p role="status">Loading details…</p>}
      {detail && (
        <>
          {canResolve && detail.canResolveSwimmerMatch && !resolving && (
            <div className={styles.toolbar}>
              <button type="button" className={styles.primary} onClick={() => setResolving(true)}>Resolve swimmer match</button>
            </div>
          )}
          {resolving && (
            <ImportSwimmerMatch
              id={row.id}
              source={<SourceLink value={detail.sourceUrl} />}
              clearsSelection={clearsSelection}
              saving={saving}
              onSaving={setSaving}
              onResolved={onResolved}
            />
          )}
          <dl className={styles.details}>
            {!resolving && <><dt>Source</dt><dd><SourceLink value={detail.sourceUrl} /></dd></>}
            <dt>Scope</dt><dd>{detail.sourceScope || "—"}</dd>
            <dt>Captured</dt><dd>{new Date(detail.capturedAt).toLocaleString()}</dd>
            <dt>Coverage</dt><dd>{detail.coverage || "—"}</dd>
            <dt>Batch ID</dt><dd><code>{detail.batchId}</code></dd>
            <dt>Record ID</dt><dd><code>{detail.recordId}</code></dd>
            <dt>File SHA-256</dt><dd><code>{detail.sha256}</code></dd>
            {detail.locator && <><dt>Source location</dt><dd>{detail.locator}</dd></>}
          </dl>
          <details className={styles.captured}>
            <summary>Captured fields</summary>
            <pre>{JSON.stringify(detail.data, null, 2)}</pre>
          </details>
        </>
      )}
    </ReviewDialog>
  );
}

function SelectedRows({ selection }: { selection: ImportSelectionPreview }) {
  const [table, setTable] = useState<ImportTableKind>(selection.meets ? "meets" : "swims");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; page?: ImportQueuePage; error?: string }>();
  const { selectionId } = selection;
  const key = `${table}/${offset}/${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      kind: table,
      offset: String(offset),
      selectionId,
      onlySelected: "true",
    });
    void importQueuePage(query, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setLoaded({ key, page });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: errorText(failure, "The selected rows could not be loaded.") });
      },
    );
    return () => controller.abort();
  }, [key, offset, selectionId, table]);
  const response = loaded?.key === key ? loaded : undefined;
  const page = response?.page;
  return (
    <>
      <div className={styles.toolbar}>
        <label>
          Selected table{" "}
          <select value={table} onChange={(event) => { setTable(event.currentTarget.value as ImportTableKind); setOffset(0); }}>
            <option value="meets">Meets</option>
            <option value="swims">Swims</option>
          </select>
        </label>
        {(offset > 0 || page?.hasNext) && (
          <nav className={styles.toolbar} aria-label="Selected row pages">
            <button type="button" disabled={!offset} onClick={() => setOffset(offset - importPageSize)}>Previous</button>
            <button type="button" disabled={!page?.hasNext} onClick={() => setOffset(offset + importPageSize)}>Next</button>
          </nav>
        )}
      </div>
      {!response && <p role="status">Loading selected rows…</p>}
      {response?.error && <p role="alert">{response.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
      {page && (page.rows.length > 0 ? (
        <ul>{page.rows.map((row) => <li key={row.id}>{row.label}</li>)}</ul>
      ) : <p>No selected {table} are pending on this page.</p>)}
    </>
  );
}

function PreviewList({ rows }: { rows: ImportPreviewItem[] }) {
  return (
    <ul>{rows.map((row) => (
      "reason" in row
        ? <li key={row.id}><strong>{row.label}</strong> · {row.reason}</li>
        : <li key={`${row.kind}/${row.id}/${row.label}`}>{row.label} <span className={styles.muted}>· {row.kind}</span></li>
    ))}</ul>
  );
}

function MorePreviewItems({ selectionId, section, start, total }: {
  selectionId: string;
  section: ImportPreviewSection;
  start: number;
  total: number;
}) {
  const [offset, setOffset] = useState<number>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows?: ImportPreviewItem[]; hasNext?: boolean; error?: string }>();
  const key = `${offset}/${attempt}`;
  useEffect(() => {
    if (offset === undefined) return;
    const controller = new AbortController();
    void importPreviewPage(selectionId, section, offset, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setLoaded({ key, ...page });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: errorText(failure, "The preview details could not be loaded.") });
      },
    );
    return () => controller.abort();
  }, [key, offset, section, selectionId]);
  if (offset === undefined) return <button type="button" onClick={() => setOffset(start)}>Show more {section === "prerequisites" ? "linked records" : "blockers"}</button>;
  const response = loaded?.key === key ? loaded : undefined;
  return (
    <>
      {!response && <p role="status">Loading preview details…</p>}
      {response?.error && <p role="alert">{response.error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></p>}
      {response?.rows && (
        <>
          <p>{(offset + 1).toLocaleString()}–{(offset + response.rows.length).toLocaleString()} of {total.toLocaleString()}</p>
          <PreviewList rows={response.rows} />
          <nav className={styles.toolbar} aria-label={section === "prerequisites" ? "Linked record pages" : "Blocker pages"}>
            <button type="button" disabled={offset <= start} onClick={() => setOffset(Math.max(start, offset - importPageSize))}>Previous</button>
            <button type="button" disabled={!response.hasNext} onClick={() => setOffset(offset + importPageSize)}>Next</button>
          </nav>
        </>
      )}
    </>
  );
}

function ApprovalPreview({ selection, onClose, onApprove }: {
  selection: ImportSelectionPreview;
  onClose: () => void;
  onApprove: () => void;
}) {
  const [showRows, setShowRows] = useState(false);
  const ready = Math.max(0, selection.selected - selection.blocked);
  const prerequisiteCount = selection.prerequisiteCount ?? selection.prerequisites.length;
  return (
    <ReviewDialog title="Approval preview" onClose={onClose}>
      <p>{selection.meets.toLocaleString()} {selection.meets === 1 ? "meet" : "meets"} · {selection.swims.toLocaleString()} {selection.swims === 1 ? "swim" : "swims"}</p>
      {selection.selected > 0 && (
        <details className={styles.captured} onToggle={(event) => setShowRows(event.currentTarget.open)}>
          <summary>{selection.selected.toLocaleString()} selected rows</summary>
          {showRows && <SelectedRows selection={selection} />}
        </details>
      )}
      {selection.blocked > 0 && (
        <details open className={styles.captured}>
          <summary>{selection.blocked.toLocaleString()} blocked</summary>
          <PreviewList rows={selection.blockers} />
          {selection.blocked > selection.blockers.length && (
            <MorePreviewItems selectionId={selection.selectionId} section="blockers" start={selection.blockers.length} total={selection.blocked} />
          )}
        </details>
      )}
      {prerequisiteCount > 0 && (
        <details className={styles.captured}>
          <summary>{prerequisiteCount.toLocaleString()} linked {prerequisiteCount === 1 ? "record" : "records"} to publish</summary>
          <PreviewList rows={selection.prerequisites} />
          {prerequisiteCount > selection.prerequisites.length && (
            <MorePreviewItems selectionId={selection.selectionId} section="prerequisites" start={selection.prerequisites.length} total={prerequisiteCount} />
          )}
        </details>
      )}
      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} disabled={ready === 0} onClick={onApprove}>
          Approve {ready.toLocaleString()} {ready === 1 ? "row" : "rows"}
        </button>
      </div>
    </ReviewDialog>
  );
}

export default function ImportsReview() {
  const [selection, setSelection] = useState(emptySelections);
  const [revision, setRevision] = useState(0);
  const [working, setWorking] = useState<"selection" | "preview" | "approval" | null>(null);
  const [preview, setPreview] = useState<ImportSelectionPreview>();
  const [pendingPreview, setPendingPreview] = useState<ImportSelectionPreview>();
  const [detail, setDetail] = useState<ImportQueueRow>();
  const [receipt, setReceipt] = useState<ImportApprovalReceipt>();
  const [resolution, setResolution] = useState<ImportSwimmerResolution>();
  const [correctedSwimIds, setCorrectedSwimIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [activeApproval, setActiveApproval] = useState<string | null>(null);
  const persistedApproval = useSyncExternalStore(subscribeToSavedApproval, readSavedApproval, () => null);
  const savedApproval = activeApproval || persistedApproval;
  const previewRequest = useRef<AbortController>(null);
  const approvalRequest = useRef<AbortController>(null);
  const resolutionMessage = useRef<HTMLParagraphElement>(null);
  const total = importSelectionCount(selection.meets) + importSelectionCount(selection.swims);
  const busy = working !== null || Boolean(savedApproval || pendingPreview);

  useEffect(() => () => {
    previewRequest.current?.abort();
    approvalRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (resolution) resolutionMessage.current?.focus();
  }, [resolution]);

  function updateSelection(kind: ImportTableKind, value: ImportTableSelection) {
    setSelection((previous) => ({ ...previous, [kind]: value }));
  }

  async function selectAll(match: ImportMatch) {
    setWorking("selection");
    setError("");
    try {
      const snapshot = await createImportSelection({
        matches: [match],
        preview: false,
      });
      updateSelection(match.kind, {
        ...emptySelection(),
        snapshot: snapshot.selected ? { id: snapshot.selectionId, count: snapshot.selected } : null,
      });
    } catch (failure) {
      setError(errorText(failure, "The selection could not be saved."));
    } finally {
      setWorking(null);
    }
  }

  async function previewSelection(saved?: ImportSelectionPreview) {
    const controller = new AbortController();
    previewRequest.current = controller;
    setWorking("preview");
    setError("");
    try {
      let snapshot = saved ?? await createImportSelection(selectionInput(Object.values(selection)), controller.signal);
      while (!controller.signal.aborted && snapshot.previewRemaining > 0) {
        setPendingPreview(snapshot);
        const next = await createImportSelection({ prepareSelectionId: snapshot.selectionId }, controller.signal);
        if (next.previewRemaining >= snapshot.previewRemaining) {
          throw new Error("Preview stopped making progress. Retry to continue reviewing the same selection.");
        }
        snapshot = next;
      }
      if (!controller.signal.aborted) {
        setPendingPreview(undefined);
        setPreview(snapshot);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure, "The selection could not be previewed."));
    } finally {
      if (!controller.signal.aborted) setWorking(null);
    }
  }

  function cancelPreview() {
    previewRequest.current?.abort();
    setPendingPreview(undefined);
    setWorking(null);
    setError("");
  }

  function clearSavedApproval() {
    setActiveApproval(null);
    writeSavedApproval(null);
  }

  async function approve(selectionId: string) {
    const controller = new AbortController();
    approvalRequest.current = controller;
    setPreview(undefined);
    setWorking("approval");
    setError("");
    setActiveApproval(selectionId);
    writeSavedApproval(selectionId);
    try {
      let remaining = Number.POSITIVE_INFINITY;
      while (!controller.signal.aborted) {
        const progress = await approveImportSelection(selectionId, controller.signal);
        setReceipt(progress);
        setResolution(undefined);
        setCorrectedSwimIds([]);
        if (progress.approved > 0) clearTimesCache();
        if (progress.done) {
          clearSavedApproval();
          setSelection(emptySelections());
          setRevision((value) => value + 1);
          break;
        }
        if (progress.remaining >= remaining) throw new Error("Approval stopped making progress. Retry to continue the saved selection.");
        remaining = progress.remaining;
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ImportRequestError && (failure.status === 404 || failure.status === 409)) {
          clearSavedApproval();
          setSelection(emptySelections());
          setRevision((value) => value + 1);
        }
        setError(errorText(failure, "Approval was interrupted. Retry to continue."));
      }
    } finally {
      if (!controller.signal.aborted) setWorking(null);
    }
  }

  function finishSwimmerMatch(result: ImportSwimmerResolution) {
    setDetail(undefined);
    setSelection(emptySelections());
    setReceipt(undefined);
    setError("");
    setResolution(result);
    setCorrectedSwimIds((previous) => {
      const combined = [...new Set([...previous, ...result.rowIds])];
      return combined.length <= 5000 ? combined : result.rowIds;
    });
    setRevision((value) => value + 1);
  }

  function selectCorrectedSwims() {
    setSelection({
      meets: emptySelection(),
      swims: { ...emptySelection(), ids: new Set(correctedSwimIds) },
    });
  }

  return (
    <div className={styles.review}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} disabled={busy || total === 0} onClick={() => void previewSelection()}>
          Preview approval
        </button>
        <span>{total.toLocaleString()} selected</span>
        <button type="button" disabled={working !== null} onClick={() => setRevision((value) => value + 1)}>Refresh queue</button>
      </div>
      {working === "selection" && <p role="status">Preparing selection…</p>}
      {(working === "preview" || pendingPreview) && (
        <div className={styles.toolbar}>
          {working === "preview" && (
            <p role="status">
              {pendingPreview
                ? `Checked ${(pendingPreview.selected - pendingPreview.previewRemaining).toLocaleString()} of ${pendingPreview.selected.toLocaleString()} selected rows…`
                : "Preparing approval preview…"}
            </p>
          )}
          {pendingPreview && working !== "preview" && (
            <button type="button" className={styles.primary} onClick={() => void previewSelection(pendingPreview)}>Retry preview</button>
          )}
          <button type="button" onClick={cancelPreview}>Cancel preview</button>
        </div>
      )}
      {working === "approval" && <p role="status">Publishing selected rows…</p>}
      {resolution && (
        <div className={styles.toolbar}>
          <p ref={resolutionMessage} tabIndex={-1} role="status">
            Swimmer match saved. {resolution.updated.toLocaleString()} {resolution.updated === 1 ? "swim" : "swims"} updated.
          </p>
          {correctedSwimIds.length > 0 && (
            <button type="button" disabled={busy || total > 0} onClick={selectCorrectedSwims}>Select corrected swims</button>
          )}
        </div>
      )}
      {receipt && (
        <p className={styles.receipt} role="status">
          {receipt.approved.toLocaleString()} approved · {receipt.duplicates.toLocaleString()} duplicates · {receipt.blocked.toLocaleString()} blocked
          {!receipt.done && ` · ${receipt.remaining.toLocaleString()} remaining`}
        </p>
      )}
      {error && <p role="alert" className={styles.blocker}>{error}</p>}
      {savedApproval && working !== "approval" && (
        <div className={styles.toolbar}>
          <button type="button" className={styles.primary} onClick={() => void approve(savedApproval)}>
            {error ? "Retry approval" : "Resume approval"}
          </button>
          <button type="button" onClick={() => {
            clearSavedApproval();
            setSelection(emptySelections());
            setRevision((value) => value + 1);
            setError("");
          }}>Dismiss saved approval</button>
        </div>
      )}
      {(["meets", "swims"] as const).map((kind) => (
        <ImportReviewTable
          key={kind}
          kind={kind}
          selection={selection[kind]}
          revision={revision}
          busy={busy}
          onSelection={(value) => updateSelection(kind, value)}
          onMatch={(match) => void selectAll(match)}
          onDetails={setDetail}
        />
      ))}
      {detail && (
        <ImportDetail
          key={detail.id}
          row={detail}
          canResolve={!busy}
          clearsSelection={total > 0}
          onClose={() => setDetail(undefined)}
          onResolved={finishSwimmerMatch}
        />
      )}
      {preview && <ApprovalPreview selection={preview} onClose={() => setPreview(undefined)} onApprove={() => void approve(preview.selectionId)} />}
    </div>
  );
}
