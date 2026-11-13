import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  getImportSwimmerMatch,
  resolveImportSwimmerMatch,
  type ImportSwimmerMatch as SwimmerMatch,
  type ImportSwimmerResolution,
} from "./imports-review-api";
import styles from "./ImportsReview.module.css";
import { timesViewHref } from "./times-url-state";

const matchEvidence = {
  source_identity: "Matching source identity",
  staged_link: "Current staged link",
  name_match: "Same name",
  search: "Search result",
} satisfies Record<SwimmerMatch["candidates"][number]["evidence"], string>;

export default function ImportSwimmerMatch({
  id,
  source,
  clearsSelection,
  saving,
  onSaving,
  onResolved,
}: {
  id: string;
  source: ReactNode;
  clearsSelection: boolean;
  saving: boolean;
  onSaving: (value: boolean) => void;
  onResolved: (resolution: ImportSwimmerResolution) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState({ value: "" });
  const [loaded, setLoaded] = useState<{ search: typeof search; match?: SwimmerMatch; error?: string }>();
  const [athleteId, setAthleteId] = useState("");
  const [reason, setReason] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    const controller = new AbortController();
    void getImportSwimmerMatch(id, search.value, controller.signal).then(
      (match) => {
        if (!controller.signal.aborted) setLoaded({ search, match });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ search, error: error instanceof Error ? error.message : "Swimmer profiles could not be loaded." });
        }
      },
    );
    return () => controller.abort();
  }, [id, search]);

  const response = loaded?.search === search ? loaded : undefined;
  const match = response?.match;
  const capture = match ?? loaded?.match;

  function searchProfiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("swimmerSearch") ?? "").trim();
    setSearch({ value });
    setAthleteId("");
    setSaveError("");
  }

  async function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!match || saving || !athleteId || !reason.trim()) return;

    onSaving(true);
    setSaveError("");
    try {
      const resolution = await resolveImportSwimmerMatch({ id, athleteId, reason: reason.trim(), matchVersion: match.matchVersion });
      onResolved(resolution);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The swimmer match could not be saved. Try again.");
    } finally {
      onSaving(false);
    }
  }

  return (
    <section className={styles.swimmerMatch}>
      <h3 ref={heading} tabIndex={-1}>Resolve swimmer match</h3>
      <dl className={styles.details}>
        <dt>Source</dt><dd>{source}</dd>
        {capture && (
          <>
            <dt>Captured swimmer</dt><dd>{capture.capturedName}</dd>
            {capture.capturedTeamName && <><dt>Captured team</dt><dd>{capture.capturedTeamName}</dd></>}
            <dt>Staged swimmer ID</dt><dd><code>{capture.currentAthleteId}</code></dd>
            <dt>Pending swims affected</dt><dd>{capture.affected.toLocaleString()}</dd>
          </>
        )}
      </dl>
      <form onSubmit={searchProfiles}>
        <fieldset className={styles.profileSearch} disabled={saving}>
          <label>
            <span>Search swimmer profiles</span>
            <input type="search" name="swimmerSearch" maxLength={200} placeholder="Name or swimmer ID" />
          </label>
          <button type="submit">Search</button>
        </fieldset>
      </form>
      {!response && <p role="status">Loading swimmer profiles…</p>}
      {response?.error && (
        <p role="alert">
          {response.error}{" "}
          <button type="button" onClick={() => setSearch({ value: search.value })}>Retry</button>
        </p>
      )}
      {match && (match.candidates.length === 0 ? (
        <p role="status">{search.value ? "No profiles matched this search." : "No profiles suggested. Search by swimmer name or ID."}</p>
      ) : (
        <form onSubmit={(event) => void saveMatch(event)} className={styles.matchForm}>
          <fieldset className={styles.matchCandidates} disabled={saving}>
            <legend>Choose the verified swimmer</legend>
            {match.candidates.map((candidate) => (
              <div key={candidate.id} className={styles.matchCandidate}>
                <label>
                  <input
                    type="radio"
                    name="swimmerMatch"
                    value={candidate.id}
                    checked={athleteId === candidate.id}
                    onChange={() => setAthleteId(candidate.id)}
                  />
                  <span>
                    <strong>{candidate.name}</strong>
                    <span className={styles.muted}>
                      {[candidate.teamName, matchEvidence[candidate.evidence]].filter(Boolean).join(" · ")}
                    </span>
                    <code className={styles.muted}>{candidate.id}</code>
                  </span>
                </label>
                <a
                  href={timesViewHref("athletes", new URLSearchParams({ athleteId: candidate.id }).toString())}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${candidate.name}’s profile (opens in a new tab)`}
                >
                  View profile
                </a>
              </div>
            ))}
          </fieldset>
          <label className={styles.matchReason}>
            <span>How did you verify the match?</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              rows={2}
              maxLength={1000}
              required
              disabled={saving}
            />
          </label>
          <p className={styles.muted}>
            Saving applies the match to all affected pending swims. Approve them separately in the queue.
            {clearsSelection && " Saving also clears the current queue selection."}
          </p>
          {saveError && <p className={styles.blocker} role="alert">{saveError}</p>}
          <div className={styles.toolbar}>
            <button type="submit" className={styles.primary} disabled={saving || !athleteId || !reason.trim()}>
              {saving ? "Saving match…" : "Save swimmer match"}
            </button>
            {saving && <span className="sr-only" role="status">Saving swimmer match…</span>}
          </div>
        </form>
      ))}
    </section>
  );
}
