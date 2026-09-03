"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./Header.css";

interface HeaderProps {
  darkBackground?: boolean;
}

export default function Header({ darkBackground = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`header ${scrolled ? "scrolled" : ""} ${darkBackground ? "header-dark-bg" : ""}`}>
      <div className="header-container">
        <Link href="/" className="logo-link">
          <picture>
            {/* Dark mode: always maintain white logo */}
            <source
              media="(prefers-color-scheme: dark) and (min-width: 768px)"
              srcSet="/assets/logo-variations/white/Long%20White.svg"
            />
            <source
              media="(prefers-color-scheme: dark) and (min-width: 480px)"
              srcSet="/assets/logo-variations/white/Small%20White.svg"
            />
            <source
              media="(prefers-color-scheme: dark)"
              srcSet="/assets/logo-variations/white/Initials%20White.svg"
            />

            {/* Light mode: toggle between white (unscrolled) and contrast (scrolled) */}
            <source
              media="(min-width: 768px)"
              srcSet={
                scrolled
                  ? "/assets/logo-variations/contrast/Long%20Contrast.svg"
                  : "/assets/logo-variations/white/Long%20White.svg"
              }
            />
            <source
              media="(min-width: 480px)"
              srcSet={
                scrolled
                  ? "/assets/logo-variations/contrast/Small%20Contrast.svg"
                  : "/assets/logo-variations/white/Small%20White.svg"
              }
            />
            <img
              src={
                scrolled
                  ? "/assets/logo-variations/contrast/Initials%20Contrast.svg"
                  : "/assets/logo-variations/white/Initials%20White.svg"
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

