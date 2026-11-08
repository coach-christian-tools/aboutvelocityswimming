"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/features/workshare/contexts/auth";
import { getAvailableTools, toolDirectory, type ToolId } from "@/lib/tool-directory";
import styles from "./ToolSidebar.module.css";

const defaultWidth = 256;
const minWidth = 180;
const maxWidth = 480;
const mobileQuery = "(width < 768px)";
// Reuse the Workshare key so existing widths carry over to the other tools.
const widthStorageKey = "admin_sidebar_width";
const widthChangeEvent = "velocity-sidebar-width";
let unsavedWidth: number | undefined;

function readPreference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function subscribeToWidth(onChange: () => void) {
  const unsubscribe = subscribeToStorage(onChange);
  window.addEventListener(widthChangeEvent, onChange);
  return () => {
    unsubscribe();
    window.removeEventListener(widthChangeEvent, onChange);
  };
}

function getSavedWidth() {
  const width = unsavedWidth ?? Number(readPreference(widthStorageKey));
  return width >= minWidth && width <= maxWidth ? width : defaultWidth;
}

function saveWidth(width: number) {
  unsavedWidth = savePreference(widthStorageKey, String(width)) ? undefined : width;
  window.dispatchEvent(new Event(widthChangeEvent));
}

type ItemProps = {
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
} & ({ href: string } | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: never }));

export function ToolSidebarItem({ active, icon: Icon, children, ...props }: ItemProps) {
  const content = <><Icon aria-hidden="true" /><span>{children}</span></>;
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={styles.item} data-active={active} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" {...props} className={styles.item} data-active={active} data-tool-sidebar-item>
      {content}
    </button>
  );
}

function ToolSwitcher({ tool }: { tool: ToolId }) {
  const { isAdmin, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const choicesId = useId();
  const switcher = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const { title } = toolDirectory[tool];

  useEffect(() => {
    if (!open) return;
    const breakpoint = window.matchMedia(mobileQuery);
    function dismiss() {
      setOpen(false);
    }
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !switcher.current?.contains(event.target)) dismiss();
    }
    document.addEventListener("pointerdown", dismissOutside);
    breakpoint.addEventListener("change", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      breakpoint.removeEventListener("change", dismiss);
    };
  }, [open]);

  return (
    <div
      ref={switcher}
      className={styles.switcher}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
      }}
    >
      <button
        ref={toggle}
        type="button"
        className={styles.toolToggle}
        aria-label={`Switch tool, current tool ${title}`}
        aria-expanded={open}
        aria-controls={choicesId}
        onClick={() => setOpen(value => !value)}
      >
        <span>{title}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <nav id={choicesId} className={styles.toolChoices} aria-label="Switch tools" hidden={!open}>
        {open && getAvailableTools(!loading && isAdmin).map(([id, destination]) =>
          id === tool ? (
            <span key={id} className={styles.toolChoice} aria-current="true">
              {destination.title}<Check aria-hidden="true" />
            </span>
          ) : (
            <Link key={id} className={styles.toolChoice} href={destination.href} onNavigate={() => setOpen(false)}>
              {destination.title}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}

export default function ToolSidebar({
  tool,
  navigationLabel,
  storageKey,
  brandHref,
  badge,
  navigation,
  footer,
  children,
}: {
  tool: ToolId;
  navigationLabel: string;
  storageKey: string;
  brandHref?: string;
  badge?: ReactNode;
  navigation: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { title } = toolDirectory[tool];
  const sidebarId = useId();
  const sidebar = useRef<HTMLElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const desktopExpand = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedOverride, setCollapsedOverride] = useState<boolean>();
  const [dragWidth, setDragWidth] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const savedCollapsed = useSyncExternalStore(
    subscribeToStorage,
    () => readPreference(storageKey) === "true",
    () => false,
  );
  const savedWidth = useSyncExternalStore(subscribeToWidth, getSavedWidth, () => defaultWidth);
  const collapsed = collapsedOverride ?? savedCollapsed;
  const width = dragWidth ?? savedWidth;

  useEffect(() => {
    if (!dragging) return;
    let nextWidth: number | undefined;
    function onMove(event: PointerEvent) {
      if (event.clientX < 100) {
        setCollapsedOverride(true);
        savePreference(storageKey, "true");
        stop();
        requestAnimationFrame(() => desktopExpand.current?.focus());
        return;
      }
      const limit = Math.min(maxWidth, Math.floor(window.innerWidth / 2));
      nextWidth = Math.min(Math.max(event.clientX, minWidth), limit);
      setDragWidth(nextWidth);
    }
    function stop() {
      if (nextWidth !== undefined) saveWidth(nextWidth);
      setDragWidth(undefined);
      setDragging(false);
    }
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging, storageKey]);

  useEffect(() => {
    const breakpoint = window.matchMedia(mobileQuery);
    function resetDrawer() {
      setMobileOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (breakpoint.matches) {
        if (mobileOpen && event.key === "Escape") {
          setMobileOpen(false);
          mobileToggle.current?.focus();
        }
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      const shortcut = event.key === "[" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!shortcut && !((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b")) return;
      event.preventDefault();
      setCollapsedOverride(!collapsed);
      savePreference(storageKey, String(!collapsed));
      if (sidebar.current?.contains(document.activeElement) || document.activeElement === desktopExpand.current) {
        requestAnimationFrame(() => (collapsed ? collapseButton : desktopExpand).current?.focus());
      }
    }
    breakpoint.addEventListener("change", resetDrawer);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      breakpoint.removeEventListener("change", resetDrawer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [collapsed, mobileOpen, storageKey]);

  function setDesktopCollapsed(next: boolean) {
    setCollapsedOverride(next);
    savePreference(storageKey, String(next));
    requestAnimationFrame(() => (next ? desktopExpand : collapseButton).current?.focus());
  }

  function closeMobile() {
    setMobileOpen(false);
    mobileToggle.current?.focus();
  }

  function toggleMobile() {
    if (mobileOpen) {
      closeMobile();
      return;
    }
    setMobileOpen(true);
    requestAnimationFrame(() => {
      const activeItem = sidebar.current?.querySelector<HTMLElement>(
        '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]',
      );
      (activeItem ?? collapseButton.current)?.focus();
    });
  }

  function collapseSidebar() {
    if (window.matchMedia(mobileQuery).matches) closeMobile();
    else setDesktopCollapsed(true);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (!["ArrowLeft", "ArrowRight", "Enter", " ", "Home", "Escape"].includes(key)) return;
    event.preventDefault();
    if (key === "Escape" || (key === "ArrowLeft" && width <= minWidth)) {
      setDesktopCollapsed(true);
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      saveWidth(Math.max(minWidth, Math.min(maxWidth, width + (key === "ArrowLeft" ? -10 : 10))));
    } else {
      saveWidth(defaultWidth);
    }
  }

  const logo = (
    <>
      <Image src="/workshare/velocity-logo-dark.png" alt="Velocity Swimming" width={1024} height={224} unoptimized className="theme-light-only" />
      <Image src="/workshare/velocity-logo-white.png" alt="Velocity Swimming" width={1024} height={224} unoptimized className="theme-dark-only" />
    </>
  );
  const backLink = <Link href="/tools" className={styles.back}><ArrowLeft aria-hidden="true" />Back to Tools</Link>;
  return (
    <div className={styles.frame} data-tool-sidebar data-drawer-open={mobileOpen}>
      <header className={styles.mobileHeader}>
        <button
          type="button"
          className={styles.mobileToggle}
          ref={mobileToggle}
          aria-controls={sidebarId}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
          onClick={toggleMobile}
        >
          {mobileOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
        </button>
        <span className={styles.mobileTitle}>{title}</span>
        {backLink}
      </header>
      {mobileOpen && <button type="button" className={styles.backdrop} tabIndex={-1} aria-label="Dismiss navigation sidebar" onClick={closeMobile} />}
      {collapsed && (
        <button
          type="button"
          className={styles.expand}
          ref={desktopExpand}
          aria-controls={sidebarId}
          aria-expanded={false}
          aria-label="Open navigation sidebar"
          onClick={() => setDesktopCollapsed(false)}
        >
          <PanelLeftOpen aria-hidden="true" />Expand
        </button>
      )}
      <aside
        id={sidebarId}
        ref={sidebar}
        aria-label="Navigation sidebar"
        className={styles.sidebar}
        data-collapsed={collapsed}
        data-mobile-open={mobileOpen}
        data-dragging={dragging}
        style={{ "--tool-sidebar-width": `${width}px` } as CSSProperties}
        onClick={(event) => {
          if (mobileOpen && event.target instanceof Element && event.target.closest("a[href], [data-tool-sidebar-item]")) closeMobile();
        }}
      >
        <div className={styles.sidebarInner}>
          <div className={styles.brand}>
            {brandHref ? <Link href={brandHref} className={styles.logo} aria-label={`${title} dashboard`}>{logo}</Link> : <div className={styles.logo}>{logo}</div>}
            <ToolSwitcher tool={tool} />
            {badge}
          </div>
          <nav className={styles.navigation} aria-label={navigationLabel}>
            {backLink}
            {navigation}
          </nav>
          <div className={styles.footer}>
            {footer}
            <button
              type="button"
              className={styles.collapse}
              ref={collapseButton}
              aria-controls={sidebarId}
              aria-expanded={true}
              aria-label="Collapse navigation sidebar"
              onClick={collapseSidebar}
            >
              <PanelLeftClose aria-hidden="true" />Collapse
            </button>
          </div>
          {!collapsed && (
            <div
              className={styles.resize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize navigation sidebar"
              aria-valuenow={width}
              aria-valuemin={minWidth}
              aria-valuemax={maxWidth}
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                setDragging(true);
              }}
              onDoubleClick={() => saveWidth(defaultWidth)}
              onKeyDown={resizeWithKeyboard}
            />
          )}
        </div>
      </aside>
      <div className={styles.content} inert={mobileOpen}>{children}</div>
    </div>
  );
}
