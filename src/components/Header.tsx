"use client";

import { useEffect, useState } from "react";
import "./Header.css";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`header ${scrolled ? "scrolled" : ""}`}>
      <div className="header-container">
        <a href="#" className="logo-link">
          <picture>
            <source media="(min-width: 768px)" srcSet={scrolled ? "/assets/logo-variations/contrast/Long%20Contrast.svg" : "/assets/logo-variations/white/Long%20White.svg"} />
            <source media="(min-width: 480px)" srcSet={scrolled ? "/assets/logo-variations/contrast/Small%20Contrast.svg" : "/assets/logo-variations/white/Small%20White.svg"} />
            <img src={scrolled ? "/assets/logo-variations/contrast/Initials%20Contrast.svg" : "/assets/logo-variations/white/Initials%20White.svg"} alt="Velocity Swimming Logo" className="logo" />
          </picture>
        </a>
        
        <nav className="nav-links">
          <a href="#about">About</a>
          <a href="#programs">Programs</a>
          <a href="#coaches">Coaches</a>
          <a href="#sponsors">Sponsors</a>
        </nav>

        <div className="cta-container">
          <a href="https://www.gomotionapp.com/team/ievs/page/online-registration1" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Join the Team
          </a>
        </div>
      </div>
    </header>
  );
}
