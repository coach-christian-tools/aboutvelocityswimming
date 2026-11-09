import {
  InventoryField,
  InventoryFilters,
  InventoryPage,
  InventoryPagination,
  InventoryTable,
  inventoryParams,
  type InventorySearchParams,
} from "@/components/collection/ImportsInventory";
import styles from "@/components/collection/ImportsInventory.module.css";
import { eventLabel, rounds } from "@/components/collection/times-data";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import { getInventoryStaffClient } from "@/lib/collection/inventory-staff";
import {
  readSwimInventory,
  swimInventoryFilters,
  swimInventoryName,
  swimInventoryOptions,
  swimInventoryPageSize,
} from "@/lib/collection/swim-inventory";

export const metadata = { title: "Swims | Velocity Imports" };

const href = "/tools/review/swims";
const description = "Browse stored swim and relay results and spot gaps in result fields, splits, and source references.";

function Select({
  name, value, options, all,
}: {
  name: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  all?: string;
}) {
  return (
    <select name={name} defaultValue={value}>
      {all && <option value="">{all}</option>}
      {options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
    </select>
  );
}

function coverageLabel(value: string | null | undefined) {
  return swimInventoryOptions.coverage.find(([option]) => value === option)?.[1] ?? "Unreported";
}

function Source({ url, method }: { url: string | null; method: string | null }) {
  const reference = url?.trim();
  const target = reference ? URL.parse(reference) : null;
  const label = method === "hytek_hy3" ? "HY3 archive" : method?.replaceAll("_", " ") || "Source";
  if (target && ["https:", "http:"].includes(target.protocol) && !target.username && !target.password) {
    return <a href={target.href} target="_blank" rel="noopener noreferrer" className={styles.cellText} title={label}>{label} ↗</a>;
  }
  if (reference) return <span>Recorded</span>;
  return (
    <span className={styles.cellText} title={method ? `Missing URL · ${label}` : "Missing URL"}>
      <span className={styles.missing}>Missing</span>{method && <span className={styles.muted}> · {label}</span>}
    </span>
  );
}

export default async function SwimsPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
  const [resolved, auth] = await Promise.all([searchParams, getInventoryStaffClient()]);
  if ("error" in auth) {
    return <InventoryPage title="Swims" description={description}><p role="alert" className={styles.notice}>{auth.error}</p></InventoryPage>;
  }

  const params = inventoryParams(resolved);
  const filters = swimInventoryFilters(params);
  const relays = filters.kind === "relays";
  const gaps = swimInventoryOptions.gap.filter(([option]) => relays ? option !== "age" : option !== "lineup");
  const result = await readSwimInventory(auth.client, filters);

  return (
    <InventoryPage title="Swims" description={description}>
      <InventoryFilters action={href} params={params}>
        <InventoryField label="Result type">
          <Select name="kind" value={filters.kind} options={swimInventoryOptions.kind} />
        </InventoryField>
        <InventoryField label="Search">
          <input type="search" name="search" defaultValue={filters.search} maxLength={100} placeholder="Swimmer, meet, team, or ID" />
        </InventoryField>
        <InventoryField label="Meet ID">
          <input type="text" name="meet" defaultValue={filters.meet} maxLength={250} placeholder="Exact meet ID" />
        </InventoryField>
        <InventoryField label="Course">
          <Select name="course" value={filters.course} options={swimInventoryOptions.course} all="All courses" />
        </InventoryField>
        <InventoryField label="Event">
          <input type="text" name="event" defaultValue={filters.event} maxLength={24} placeholder="100 FR or 100_FR_SCY" />
        </InventoryField>
        <InventoryField label="Status">
          <Select name="status" value={filters.status} options={swimInventoryOptions.status} all="All statuses" />
        </InventoryField>
        <InventoryField label="Gender">
          <Select name="gender" value={filters.gender} options={swimInventoryOptions.gender} all="All genders" />
        </InventoryField>
        <InventoryField label="From"><input type="date" name="from" defaultValue={filters.from} /></InventoryField>
        <InventoryField label="Through"><input type="date" name="to" defaultValue={filters.to} /></InventoryField>
        <InventoryField label="Split coverage">
          <Select name="coverage" value={filters.coverage} options={swimInventoryOptions.coverage} all="All coverage" />
        </InventoryField>
        <InventoryField label="Missing data">
          <Select name="gap" value={filters.gap} options={gaps} all="All records" />
        </InventoryField>
        <InventoryField label="Sort">
          <Select name="sort" value={filters.sort} options={swimInventoryOptions.sort} />
        </InventoryField>
      </InventoryFilters>
      {"error" in result ? (
        <p role="alert" className={styles.notice}>{result.error}</p>
      ) : (
        <>
          <InventoryPagination href={href} params={params} offset={filters.offset} pageSize={swimInventoryPageSize} count={result.rows.length} hasMore={result.hasMore} />
          <InventoryTable
            label={relays ? "Relay results" : "Swim results"}
            columns={[
              "Swimmer / relay", "Date", "Meet", "Team", "Event", "Course", "Round", "Time",
              "Status", "Gender", relays ? "Age group" : "Age", "Official", "Splits",
              ...(relays ? ["Lineup"] : []), "Source", "Result ID",
            ]}
            empty={result.rows.length ? undefined : "No results match these filters."}
          >
            {result.rows.map((row) => {
              const splits = coverageLabel(row.split_coverage);
              const lineup = coverageLabel(row.lineup_coverage);
              const age = relays ? row.relay_age?.trim() : row.age && /^\d{1,3}$/.test(row.age) ? row.age : null;
              const gender = row.gender && ["F", "M", "X"].includes(row.gender) ? row.gender : null;
              const swimmer = swimInventoryName(row) || "—";
              const meet = row.meet || row.meet_id || "—";
              const team = row.team_name || row.team || "—";
              const event = row.event_code ? eventLabel(row.event_code) : "—";
              const eventTitle = row.event_number ? `${event} · Source event #${row.event_number}` : event;
              const official = row.official === "true" ? "Yes" : row.official === "false" ? "No" : null;
              const time = row.time_ms != null && row.time_ms > 0 ? formatSwimTime(row.time_ms) : null;
              return (
                <tr key={row.id}>
                  <th scope="row"><span className={styles.cellText} title={swimmer}>{swimmer}</span></th>
                  <td className={styles.numeric}>{row.date || "—"}</td>
                  <td><span className={styles.cellText} title={meet}>{meet}</span></td>
                  <td><span className={styles.cellText} title={team}>{team}</span></td>
                  <td><span className={styles.cellText} title={eventTitle}>{event}{row.event_number && <span className={styles.muted}> #{row.event_number}</span>}</span></td>
                  <td>{row.course || "—"}</td>
                  <td title={row.round ? rounds[row.round] : undefined}>{row.round || "—"}</td>
                  <td className={styles.numeric}>{time ?? (row.status === "OK" ? <span className={styles.missing}>Missing</span> : "—")}</td>
                  <td>{row.status || "—"}</td>
                  <td className={gender ? undefined : styles.missing}>{gender || "Missing"}</td>
                  <td className={age ? styles.numeric : styles.missing}>{age || "Missing"}</td>
                  <td className={official ? undefined : styles.missing}>{official ?? "Unreported"}</td>
                  <td className={splits === "Complete" || row.status !== "OK" ? undefined : styles.missing}>{splits}</td>
                  {relays && <td className={lineup === "Complete" ? undefined : styles.missing}>{lineup}</td>}
                  <td><Source url={row.source_url} method={row.source_method} /></td>
                  <td><code className={styles.cellText} title={row.id}>{row.id}</code></td>
                </tr>
              );
            })}
          </InventoryTable>
        </>
      )}
    </InventoryPage>
  );
}
