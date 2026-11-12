import Link from "next/link";
import SearchableSelect from "@/components/shared/SearchableSelect";
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
import { getInventoryStaffClient } from "@/lib/collection/inventory-staff";
import {
  IMPORT_STATES,
  MEET_CATEGORIES,
  MEET_QUEUE_PAGE_SIZE,
  parseMeetQueueQuery,
  type MeetQueueResponse,
  type MeetQueueRow,
} from "@/lib/collection/meet-queue";
import type { Json } from "@/lib/supabase/database.types";

const href = "/tools/review/meet-inventory";
const columns = [
  "Meet", "Starts", "Ends", "Location", "Course", "Host", "Category",
  "IES participation", "Team coverage", "Results files", "Import status",
  "Approved swims", "Blockers", "Source",
];

export const metadata = { title: "Meets | Velocity Imports" };

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function catalogText(data: MeetQueueRow["data"], key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function httpSource(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

function Missing() {
  return (
    <span className={styles.missing}>
      <span aria-hidden="true">—</span><span className="sr-only">Missing</span>
    </span>
  );
}

function CellText({ value, title = value }: { value: string; title?: string }) {
  return <span className={styles.cellText} title={title}>{value}</span>;
}

function MeetRow({ row }: { row: MeetQueueRow }) {
  const location = catalogText(row.data, "location")
    || catalogText(row.data, "venueName")
    || catalogText(row.data, "city");
  const course = catalogText(row.data, "course")
    || (catalogText(row.data, "discipline") === "open_water" ? "Open water" : "");
  const sourceCourses = Array.isArray(row.data.sourceCourses)
    ? [...new Set(row.data.sourceCourses.filter((value): value is string =>
      typeof value === "string" && ["SCY", "LCM", "SCM"].includes(value),
    ))]
    : [];
  const fileCourses = sourceCourses.join(", ");
  const host = catalogText(row.data, "hostTeamName");
  const source = httpSource(row.sourceUrl);
  const meetId = catalogText(row.data, "canonicalMeetId") || row.id;
  const swimParams = new URLSearchParams({ meet: meetId });
  const recordedTeams = row.participants.filter(team => team.basis === "recorded").length;
  const scope = catalogText(row.data, "participationScope");
  const coverage = row.teamCoverage === "complete" ? "Complete in documented scope" : stateLabel(row.teamCoverage);
  const coverageSummary = `${coverage} · ${recordedTeams.toLocaleString()} recorded`;
  const categoryValue = catalogText(row.data, "meetCategory");
  const category = MEET_CATEGORIES.find(value => value === categoryValue) ?? "unknown";
  const canceled = ["canceled", "cancelled"].includes(catalogText(row.data, "status").toLowerCase());

  return (
    <tr>
      <th scope="row">
        <CellText value={row.title} title={`${row.title} (${row.id})`} />
        <span className="sr-only">, catalog ID {row.id}</span>
      </th>
      <td className={styles.numeric}>{row.startsOn || <Missing />}</td>
      <td className={styles.numeric}>{row.endsOn || <Missing />}</td>
      <td>{location ? <CellText value={location} /> : <Missing />}</td>
      <td>
        {course ? <CellText value={course} title={fileCourses ? `${course} · Results files: ${fileCourses}` : course} /> : <Missing />}
        {fileCourses && <span className={course ? "sr-only" : styles.muted}> · Files: {fileCourses}</span>}
      </td>
      <td>{host ? <CellText value={host} /> : <Missing />}</td>
      <td>
        {stateLabel(category)}
        {canceled && <span className={styles.muted}> · Canceled</span>}
      </td>
      <td>{row.iesParticipation === "none" ? "None in documented scope" : stateLabel(row.iesParticipation)}</td>
      <td>
        <CellText value={coverageSummary} title={scope ? `${coverageSummary}\n${scope}` : coverageSummary} />
      </td>
      <td>{stateLabel(row.acquisitionState)}</td>
      <td>
        {stateLabel(row.importState)}
        {row.selected && <span className={styles.muted}> · Requested, priority {row.priority}</span>}
      </td>
      <td className={styles.numeric}>
        {row.importedSwims > 0 ? (
          <Link href={`/tools/review/swims?${swimParams}`} aria-label={`Browse ${row.importedSwims.toLocaleString()} approved individual swims for ${row.title}`}>
            {row.importedSwims.toLocaleString()}
          </Link>
        ) : 0}
      </td>
      <td>
        {row.blockers.length > 0 ? <CellText value={row.blockers.join(" · ")} /> : "None"}
      </td>
      <td>
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer" aria-label={`View source for ${row.title}`}>View</a>
        ) : <Missing />}
      </td>
    </tr>
  );
}

function MeetFilters({ params, facets }: { params: URLSearchParams; facets?: MeetQueueResponse["facets"] }) {
  return (
    <InventoryFilters action={href} params={params}>
      <InventoryField label="Search meets">
        <input type="search" name="search" maxLength={200} placeholder="Meet, location, or team" defaultValue={params.get("search") ?? ""} />
      </InventoryField>
      <InventoryField label="Year">
        <select name="year" defaultValue={params.get("year") ?? ""}>
          <option value="">All years</option>
          {facets?.years.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
      </InventoryField>
      <SearchableSelect
        label="Participating team"
        fieldClassName={styles.field}
        className={styles.teamSelect}
        name="team"
        defaultValue={params.get("team") ?? ""}
        options={facets?.teams.map(({ id, name }) => [id, name]) ?? []}
        emptyLabel="All teams"
        searchPlaceholder="Search teams"
      />
      <InventoryField label="IES participation">
        <select name="ies" defaultValue={params.get("ies") ?? ""}>
          <option value="">Any evidence</option>
          <option value="confirmed">Confirmed</option>
          <option value="unknown">Unknown</option>
          <option value="none">None in documented scope</option>
        </select>
      </InventoryField>
      <InventoryField label="Meet category">
        <select name="category" defaultValue={params.get("category") ?? ""}>
          <option value="">All categories</option>
          {MEET_CATEGORIES.map(category => <option key={category} value={category}>{stateLabel(category)}</option>)}
        </select>
      </InventoryField>
      <InventoryField label="Collection request">
        <select name="selected" defaultValue={params.get("selected") ?? ""}>
          <option value="">Any request</option>
          <option value="true">Requested</option>
          <option value="false">Not requested</option>
        </select>
      </InventoryField>
      <InventoryField label="Import progress">
        <select name="progress" defaultValue={params.get("progress") ?? ""}>
          <option value="">Any progress</option>
          {[...IMPORT_STATES, "blocked"].map(state => <option key={state} value={state}>{stateLabel(state)}</option>)}
        </select>
      </InventoryField>
    </InventoryFilters>
  );
}

async function loadMeets(params: URLSearchParams) {
  const auth = await getInventoryStaffClient();
  if ("error" in auth) return { error: auth.error };
  let query;
  try {
    query = parseMeetQueueQuery(params);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid meet filters." };
  }

  const { data, error } = await auth.client.rpc("meet_collection_queue", { input: query as unknown as Json });
  if (error || !data) return { error: "The meet inventory could not be loaded. Try again." };
  return { inventory: data as unknown as MeetQueueResponse, offset: query.offset };
}

export default async function MeetsPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
  const params = inventoryParams(await searchParams);
  params.delete("export");
  const { inventory, offset, error } = await loadMeets(params);

  return (
    <InventoryPage title="Meets" description="Audit approved catalog meets, including listings with zero imported results.">
      <p className={styles.notice}><Link href="/tools/review/meets">Manage meet collection</Link></p>
      <MeetFilters params={params} facets={inventory?.facets} />
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {inventory && (
        <>
          <p className={styles.notice}>
            The swim count includes linked, approved individual results. Team coverage applies to the documented source scope. A dash marks a missing catalog field.
          </p>
          <InventoryPagination href={href} params={params} offset={offset} pageSize={MEET_QUEUE_PAGE_SIZE} count={inventory.rows.length} hasMore={inventory.hasNext} total={inventory.total} />
          <InventoryTable
            label="Meet inventory"
            columns={columns}
            empty={inventory.rows.length ? undefined : inventory.total ? "No catalog meets on this page." : "No catalog meets match these filters."}
          >
            {inventory.rows.map(row => <MeetRow key={row.id} row={row} />)}
          </InventoryTable>
        </>
      )}
    </InventoryPage>
  );
}
