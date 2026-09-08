"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./Header.css";

interface HeaderProps {
  darkBackground?: boolean;
  minimal?: boolean;
}

export default function Header({ darkBackground = false, minimal = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [activeTheme, setActiveTheme] = useState<string>("light");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);

    const updateThemeState = () => {
      const themeAttr = document.documentElement.getAttribute("data-theme");
      if (themeAttr) {
        setActiveTheme(themeAttr);
      } else {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setActiveTheme(isDark ? "dark" : "light");
      }
    };

    updateThemeState();
    const observer = new MutationObserver(updateThemeState);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("velocity-theme-change", updateThemeState);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("velocity-theme-change", updateThemeState);
      observer.disconnect();
    };
  }, []);

  if (minimal) {
    return (
      <header className="header header-minimal">
        <div className="header-container header-container-minimal">
          <Link href="/" className="logo-link" aria-label="Velocity Swimming Home">
            <picture>
              <source
                media="(min-width: 768px)"
                srcSet="/assets/logo-variations/contrast/Long%20Contrast.svg"
              />
              <source
                media="(min-width: 480px)"
                srcSet="/assets/logo-variations/contrast/Small%20Contrast.svg"
              />
              <img
                src="/assets/logo-variations/contrast/Initials%20Contrast.svg"
                alt="Velocity Swimming Logo"
                className="logo"
              />
            </picture>
          </Link>
        </div>
      </header>
    );
  }

  const isDark = activeTheme === "dark";

  return (
    <header className={`header ${scrolled ? "scrolled" : ""} ${darkBackground ? "header-dark-bg" : ""}`}>
      <div className="header-container">
        <Link href="/" className="logo-link" aria-label="Velocity Swimming Home">
          <picture>
            <source
              media="(min-width: 768px)"
              srcSet={
                isDark
                  ? "/assets/logo-variations/white/Long%20White.svg"
                  : (scrolled
                      ? "/assets/logo-variations/contrast/Long%20Contrast.svg"
                      : "/assets/logo-variations/white/Long%20White.svg")
              }
            />
            <source
              media="(min-width: 480px)"
              srcSet={
                isDark
                  ? "/assets/logo-variations/white/Small%20White.svg"
                  : (scrolled
                      ? "/assets/logo-variations/contrast/Small%20Contrast.svg"
                      : "/assets/logo-variations/white/Small%20White.svg")
              }
            />
            <img
              src={
                isDark
                  ? "/assets/logo-variations/white/Initials%20White.svg"
                  : (scrolled
                      ? "/assets/logo-variations/contrast/Initials%20Contrast.svg"
                      : "/assets/logo-variations/white/Initials%20White.svg")
              }
              alt="Velocity Swimming Logo"
              className="logo"
            />
          </picture>
        </Link>

        <nav className="nav-links">
          <Link href="/#about">About</Link>
          <Link href="/#programs">Programs</Link>
          <Link href="/#coaches">Coaches</Link>
          <Link href="/#sponsors">Sponsors</Link>
          <Link href="/store">Store</Link>
        </nav>

        <div className="cta-container">
          <a
            href="https://www.gomotionapp.com/team/ievs/page/online-registration1"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Join the Team
          </a>
        </div>
      </div>
    </header>
  );
}

