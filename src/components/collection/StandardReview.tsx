import type { StandardSet } from "@/features/swim-resources/types/schema";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import { flatCuts, standardDiff } from "./standards-data";
export default function StandardReview({
  before,
  after,
}: {
  before: StandardSet | null;
  after: StandardSet | null;
}) {
  const set = after ?? before;
  if (!set) return null;
  const changes = standardDiff(before, after);
  return (
    <section aria-label="Standard changes" className="space-y-3">
      <h4 className="font-semibold">{set.name}</h4>
      <p>
        {set.seasonYears} · {set.effectiveDate} to {set.expirationDate} ·{" "}
        {flatCuts(after).size} proposed cuts
      </p>
      {set.sourceUrl && /^https?:\/\//.test(set.sourceUrl) && (
        <a
          className="underline"
          href={set.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Official standard source
        </a>
      )}
      <p>
        {changes.filter((c) => c.before === undefined).length} added ·{" "}
        {
          changes.filter((c) => c.before !== undefined && c.after !== undefined)
            .length
        }{" "}
        changed · {changes.filter((c) => c.after === undefined).length} removed
      </p>
      {changes.length === 0 ? (
        <p>No cut changes. Review metadata below.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Cut changes by course, gender, age, event, and tier
            </caption>
            <thead>
              <tr>
                <th>Cut</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.key}>
                  <th className="font-normal">{change.key}</th>
                  <td>{formatSwimTime(change.before)}</td>
                  <td>{formatSwimTime(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
