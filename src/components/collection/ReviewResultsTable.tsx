import type { raceSummary } from "./review-summary";
import styles from "./ReviewResultsTable.module.css";

type ReviewResultRow = {
  path: string;
  race: ReturnType<typeof raceSummary>;
  action: string;
  issueCount: number;
};

export default function ReviewResultsTable({ rows }: { rows: ReviewResultRow[] }) {
  return (
    <div className={styles.scroll} role="region" aria-label="Import results" tabIndex={0}>
      <table className={styles.table}>
        <caption className="sr-only">Batch race results</caption>
        <thead>
          <tr>
            <th scope="col">Swimmer / relay</th>
            <th scope="col">Event</th>
            <th scope="col">Course</th>
            <th scope="col">Time / status</th>
            <th scope="col">Meet</th>
            <th scope="col">Date</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ path, race, action, issueCount }) => (
            <tr key={path}>
              <th scope="row">{race.swimmer}</th>
              <td>
                {race.event}
                {race.round && <span className={styles.secondary}>{race.round}</span>}
              </td>
              <td>{race.course}</td>
              <td className={styles.numeric}>{race.time}</td>
              <td>{race.meet}</td>
              <td className={styles.numeric}>{race.date || "—"}</td>
              <td>
                {action}
                {issueCount > 0 && <span className={styles.secondary}>{issueCount} {issueCount === 1 ? "issue" : "issues"}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
