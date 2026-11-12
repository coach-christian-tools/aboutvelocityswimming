import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BookmarkPlus, ChevronDown, Pencil } from "lucide-react";
import { useAuth } from "@/features/workshare/contexts/auth";
import { browserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { initialFilters, type Filters } from "./times-data";
import { timesUrl } from "./times-api";
import { readTimesSelection } from "./times-url-state";
import s from "./RankingFilters.module.css";
import times from "./TimesDatabase.module.css";

type Bookmark = Pick<
  Database["public"]["Tables"]["times_ranking_bookmarks"]["Row"],
  "id" | "name" | "filters" | "search"
>;
const bookmarkFields = "id,name,filters,search";

interface Props {
  filters: Filters;
  search: string;
  onApply: (filters: Filters, search: string) => void;
  children: ReactNode;
}

function filterKey(filters: Filters, search: string) {
  return timesUrl("rankings", {
    ...filters,
    search: search.trim().toLowerCase(),
  });
}

export default function RankingFilters(props: Props) {
  const { user, loading } = useAuth();
  return (
    <RankingFilterPanel
      key={user?.uid}
      userId={user?.uid}
      authLoading={loading}
      {...props}
    />
  );
}

function RankingFilterPanel({
  filters,
  search,
  onApply,
  children,
  userId,
  authLoading,
}: Props & { userId?: string; authLoading: boolean }) {
  const [open, setOpen] = useState(true);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [listRequest, setListRequest] = useState(0);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function loadBookmarks(ownerId: string) {
      try {
        const { data, error } = await browserClient()
          .from("times_ranking_bookmarks")
          .select(bookmarkFields)
          .eq("user_id", ownerId)
          .order("created_at")
          .order("id")
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) throw error;
        setBookmarks(data);
        setListStatus("ready");
      } catch {
        if (!controller.signal.aborted) setListStatus("error");
      }
    }
    void loadBookmarks(userId);
    return () => controller.abort();
  }, [userId, listRequest]);

  function openEditor(bookmark: Bookmark | null) {
    setEditing(bookmark);
    setName(bookmark?.name ?? "");
    setError("");
    dialog.current?.showModal();
    nameInput.current?.focus();
  }

  async function saveBookmark(remove = false) {
    if (!userId || busy || (remove ? !editing : !name.trim())) return;
    setBusy(true);
    setError("");
    try {
      const table = browserClient().from("times_ranking_bookmarks");
      const query = editing
        ? (remove ? table.delete() : table.update({ name: name.trim() }))
            .eq("id", editing.id)
            .eq("user_id", userId)
        : table.insert({
            user_id: userId,
            name: name.trim(),
            filters: { ...filters },
            search,
          });
      const result = await query.select(bookmarkFields).single();
      if (result.error) throw result.error;
      const saved = result.data;
      setBookmarks((current) =>
        remove
          ? current.filter((bookmark) => bookmark.id !== saved.id)
          : editing
            ? current.map((bookmark) =>
                bookmark.id === saved.id ? saved : bookmark,
              )
            : [...current, saved],
      );
      setNotice(
        remove
          ? "Bookmark deleted."
          : editing
            ? "Bookmark renamed."
            : "Bookmark saved.",
      );
      dialog.current?.close();
      if (remove) toggle.current?.focus();
    } catch {
      setError(
        remove
          ? "Couldn’t delete this bookmark. Try again."
          : "Couldn’t save this bookmark. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const active = filterKey(filters, search);
  return (
    <section aria-label="Event ranking filters">
      {bookmarks.length > 0 && (
        <ul className={s.bookmarks} aria-label="Bookmarked filters">
          {bookmarks.map((bookmark) => {
            const saved = readTimesSelection(
              JSON.stringify(bookmark.filters),
              initialFilters,
            );
            return (
              <li className={s.chip} key={bookmark.id}>
                <button
                  type="button"
                  aria-pressed={active === filterKey(saved, bookmark.search)}
                  onClick={() => onApply(saved, bookmark.search)}
                >
                  {bookmark.name}
                </button>
                <button
                  type="button"
                  aria-label={`Edit bookmark ${bookmark.name}`}
                  onClick={() => openEditor(bookmark)}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {userId && listStatus === "error" && (
        <p className={times.notice} role="alert">
          Couldn’t load your bookmarks.{" "}
          <button
            type="button"
            className={times.link}
            onClick={() => {
              setListStatus("loading");
              setListRequest((request) => request + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      <div className={s.heading}>
        <button
          ref={toggle}
          type="button"
          className={s.toggle}
          aria-expanded={open}
          aria-controls={`${id}-controls`}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={17} aria-hidden="true" />
          Event filters
        </button>
        {open &&
          !authLoading &&
          (userId ? (
            <button
              type="button"
              className={s.save}
              disabled={listStatus !== "ready"}
              onClick={() => openEditor(null)}
            >
              <BookmarkPlus size={16} aria-hidden="true" />
              Bookmark filters
            </button>
          ) : (
            <Link className={times.link} href="/login">
              Sign in to bookmark filters
            </Link>
          ))}
      </div>
      <div id={`${id}-controls`} hidden={!open}>
        {children}
      </div>
      <p role="status" className="sr-only">
        {notice}
      </p>
      <dialog
        ref={dialog}
        className={`${times.eventDialog} ${s.dialog}`}
        aria-labelledby={`${id}-title`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveBookmark();
          }}
        >
          <h2 id={`${id}-title`}>
            {editing ? "Rename bookmark" : "Bookmark filters"}
          </h2>
          <label className={times.field}>
            Bookmark name
            <input
              ref={nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <div className={s.actions}>
            {editing && (
              <button
                type="button"
                className={s.delete}
                disabled={busy}
                onClick={() => void saveBookmark(true)}
              >
                Delete bookmark
              </button>
            )}
            <button
              type="button"
              className={times.button}
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={s.save}
              disabled={busy || !name.trim()}
            >
              {editing ? "Save name" : "Save bookmark"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
