import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ImportsInventory.module.css";

export type InventorySearchParams = Record<string, string | string[] | undefined>;

export function inventoryParams(searchParams: InventorySearchParams) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(name, first);
  }
  return params;
}

export function InventoryPage({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}

export function InventoryFilters({ action, params, children }: {
  action: string;
  params: URLSearchParams;
  children: ReactNode;
}) {
  return (
    <Form action={action} aria-label="Filters" prefetch={false}>
      <fieldset className={styles.filters} key={params.toString()}>
        <legend className="sr-only">Filters</legend>
        {children}
        <div className={styles.filterActions}>
          <button type="submit">Apply filters</button>
          <Link href={action} prefetch={false}>Clear filters</Link>
        </div>
      </fieldset>
    </Form>
  );
}

export function InventoryField({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export function InventoryTable({ label, columns, children, empty }: {
  label: string;
  columns: readonly string[];
  children: ReactNode;
  empty?: string;
}) {
  return (
    <div className={styles.tableScroll} role="region" aria-label={label} tabIndex={0}>
      <table className={styles.table}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          {empty ? <tr><td colSpan={columns.length} className={styles.empty}>{empty}</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}

export function InventoryPagination({ href, params, offset, pageSize, count, hasMore, total }: {
  href: string;
  params: URLSearchParams;
  offset: number;
  pageSize: number;
  count: number;
  hasMore: boolean;
  total?: number;
}) {
  function pageHref(nextOffset: number) {
    const pageParams = new URLSearchParams(params);
    if (nextOffset > 0) pageParams.set("offset", String(nextOffset));
    else pageParams.delete("offset");
    const query = pageParams.toString();
    return query ? `${href}?${query}` : href;
  }

  const range = count ? `${(offset + 1).toLocaleString()}–${(offset + count).toLocaleString()}` : "0";
  return (
    <div className={styles.pagination}>
      <p>Showing {range}{total !== undefined ? ` of ${total.toLocaleString()}` : ""} rows</p>
      {(offset > 0 || hasMore) && (
        <nav aria-label="Result pages">
          {offset > 0 && <Link href={pageHref(Math.max(0, offset - pageSize))} prefetch={false}>Previous</Link>}
          {hasMore && <Link href={pageHref(offset + pageSize)} prefetch={false}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
