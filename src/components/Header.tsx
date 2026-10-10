"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isStaffRoute } from "@/lib/staff-routes";
import styles from "./Header.module.css";
import { scopedClasses } from "@/lib/styles";

const sections = [
  { href: "/schedule", label: "Schedule" },
  { href: "/news", label: "News" },
  { href: "/tools", label: "Tools" },
];
const aboutSections = [
  { href: "/#overview", label: "Overview" },
  { href: "/#about", label: "Youth Development" },
  { href: "/#programs", label: "Programs" },
  { href: "/#join", label: "How to Join" },
  { href: "/#community", label: "Velocity in Action" },
  { href: "/#coaches", label: "Coaches" },
  { href: "/#masters", label: "Masters Swimming" },
  { href: "/#social", label: "Social Highlights" },
];
const moreSections = [
  { href: "/store", label: "Store" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "https://www.gomotionapp.com/team/ievs/page/home", label: "SportsEngine" },
  { href: "https://www.gomotionapp.com/team/wzielsc/page/home", label: "Inland Empire" },
];

function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}
const getScrollSnapshot = () => window.scrollY > 24;
const getServerScrollSnapshot = () => false;

function Navigation({ pathname }: { pathname: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"about" | "more" | null>(null);
  const aboutOpen = openDropdown === "about";
  const moreOpen = openDropdown === "more";
  const moreToggle = useRef<HTMLButtonElement>(null);
  const moreActive = moreSections.some(({ href }) => href.startsWith("/") && (pathname === href || pathname.startsWith(href + "/")));
  const headerRef = useRef<HTMLElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const aboutLink = useRef<HTMLAnchorElement>(null);
  const aboutToggle = useRef<HTMLButtonElement>(null);
  const scrolled = useSyncExternalStore(subscribeScroll, getScrollSnapshot, getServerScrollSnapshot);
  const isHome = pathname === "/";
  const overlay = isHome && !scrolled && !mobileOpen;

  function closeMenus() {
    setMobileOpen(false);
    setOpenDropdown(null);
  }

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMobileOpen(false);
        setOpenDropdown(null);
      }
    }
    function resetMenus() {
      setMobileOpen(false);
      setOpenDropdown(null);
    }
    const breakpoint = window.matchMedia("(max-width: 960px)");
    breakpoint.addEventListener("change", resetMenus);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      breakpoint.removeEventListener("change", resetMenus);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={scopedClasses(styles, `site-header${overlay ? " site-header-overlay" : ""}`)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (aboutOpen) {
            if (window.matchMedia("(min-width: 961px)").matches) {
              aboutLink.current?.focus();
            } else {
              aboutToggle.current?.focus();
            }
            setOpenDropdown(null);
          } else if (moreOpen) {
            moreToggle.current?.focus();
            setOpenDropdown(null);
          } else if (mobileOpen) {
            setMobileOpen(false);
            mobileToggle.current?.focus();
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) closeMenus();
        }}
      >
        <div className={scopedClasses(styles, 'site-header-inner')}>
          <Link href="/" className={scopedClasses(styles, 'site-logo')} aria-label="Velocity Swimming home" onClick={closeMenus}>
            <Image className={scopedClasses(styles, 'site-logo-contrast')} src="/assets/logo-variations/contrast/Long%20Contrast.svg" width={1822} height={400} alt="" loading="eager" />
            <Image className={scopedClasses(styles, 'site-logo-white')} src="/assets/logo-variations/white/Long%20White.svg" width={1822} height={400} alt="" loading="eager" />
          </Link>

          <button
            ref={mobileToggle}
            className={scopedClasses(styles, 'site-menu-toggle')}
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="site-navigation"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            onClick={() => { setMobileOpen(!mobileOpen); setOpenDropdown(null); }}
          >
            <span>{mobileOpen ? "Close" : "Menu"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d={mobileOpen ? "m6 6 12 12M6 18 18 6" : "M4 7h16M4 12h16M4 17h16"} />
            </svg>
          </button>

          <nav id="site-navigation" aria-label="Main navigation" className={scopedClasses(styles, `site-navigation${mobileOpen ? " is-open" : ""}`)}>
            <div className={scopedClasses(styles, 'site-nav-links')}>
              <div className={scopedClasses(styles, 'site-about')}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" && window.matchMedia("(min-width: 961px)").matches) setOpenDropdown("about");
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse" && window.matchMedia("(min-width: 961px)").matches && !event.currentTarget.contains(document.activeElement)) setOpenDropdown(null);
                }}
                onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpenDropdown(null);
              }}>
                <div className={scopedClasses(styles, 'site-about-heading')}>
                  <Link
                    ref={aboutLink}
                    href="/"
                    className={scopedClasses(styles, 'site-nav-link')}
                    aria-current={isHome ? "page" : undefined}
                    aria-expanded={aboutOpen}
                    aria-controls="about-sections"
                    onFocus={() => {
                      if (window.matchMedia("(min-width: 961px)").matches) setOpenDropdown("about");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" && aboutOpen) {
                        event.preventDefault();
                        event.currentTarget.closest(".site-about")?.querySelector<HTMLAnchorElement>(".site-dropdown a")?.focus();
                      }
                    }}
                    onClick={closeMenus}
                  >About</Link>
                  <button
                    ref={aboutToggle}
                    className={scopedClasses(styles, 'site-about-toggle')}
                    type="button"
                    aria-label="About sections"
                    aria-expanded={aboutOpen}
                    aria-controls="about-sections"
                    onClick={() => setOpenDropdown(aboutOpen ? null : "about")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <ul id="about-sections" className={scopedClasses(styles, 'site-dropdown')} hidden={!aboutOpen}>
                  {aboutSections.map(({ href, label }) => <li key={href}><Link href={href} aria-current={pathname === href ? "page" : undefined} onClick={closeMenus}>{label}</Link></li>)}
                </ul>
              </div>
              {sections.map(({ href, label }) => (
                <Link key={href} href={href} className={scopedClasses(styles, 'site-nav-link')} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} onClick={closeMenus}>{label}</Link>
              ))}
              <div className={scopedClasses(styles, 'site-more')}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" && window.matchMedia("(min-width: 961px)").matches) setOpenDropdown("more");
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse" && window.matchMedia("(min-width: 961px)").matches && !event.currentTarget.contains(document.activeElement)) setOpenDropdown(null);
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setOpenDropdown(null);
                }}
              >
                <button
                  ref={moreToggle}
                  type="button"
                  className={scopedClasses(styles, 'site-nav-link site-more-toggle')}
                  aria-expanded={moreOpen}
                  aria-controls="more-sections"
                  data-active={moreActive || undefined}
                  onClick={() => setOpenDropdown(moreOpen ? null : "more")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && moreOpen) {
                      event.preventDefault();
                      event.currentTarget.closest(".site-more")?.querySelector<HTMLAnchorElement>(".site-dropdown a")?.focus();
                    }
                  }}
                >More</button>
                <ul id="more-sections" className={scopedClasses(styles, 'site-dropdown')} hidden={!moreOpen}>
                  {moreSections.map(({ href, label }) => (
                    <li key={href}>
                      {href.startsWith("/") ? (
                        <Link href={href} aria-current={pathname === href ? "page" : pathname.startsWith(href + "/") ? "true" : undefined} onClick={closeMenus}>{label}</Link>
                      ) : (
                        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label + " (external site, opens in a new tab)"} onClick={closeMenus}>
                          {label}
                          <svg className={scopedClasses(styles, 'site-external-icon')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                          </svg>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <a href="https://www.gomotionapp.com/team/ievs/page/online-registration1" target="_blank" rel="noopener noreferrer" className={scopedClasses(styles, 'btn btn-primary site-join')} onClick={closeMenus}>Join the Team</a>
          </nav>
        </div>
      </header>
      {!isHome && <div className={scopedClasses(styles, 'site-header-spacer')} aria-hidden="true" />}
    </>
  );
}

export default function Header() {
  const pathname = usePathname();
  if (isStaffRoute(pathname)) return null;
  // A route change resets disclosures without an effect or a flash of stale state.
  return <Navigation key={pathname} pathname={pathname} />;
}
