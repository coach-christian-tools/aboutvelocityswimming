"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import "./Footer.css";

function subscribeTheme(callback: () => void) {
  window.addEventListener("velocity-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("velocity-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot() {
  return localStorage.getItem("velocity-theme") || "system";
}

function getServerThemeSnapshot() {
  return "system";
}

export default function Footer() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const themePreference = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  const handleThemeChange = (preference: "system" | "light" | "dark") => {
    try {
      localStorage.setItem("velocity-theme", preference);

      let targetTheme = preference;
      if (preference === "system") {
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        targetTheme = systemDark ? "dark" : "light";
      }

      document.documentElement.setAttribute("data-theme", targetTheme);
      document.documentElement.setAttribute("data-theme-preference", preference);

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute("content", targetTheme === "dark" ? "#102638" : "#FFFFFF");
      }

      window.dispatchEvent(new Event("velocity-theme-change"));
    } catch (e) {}
  };

  const handleCopyEmail = (e: React.MouseEvent, email: string, label: string) => {
    e.preventDefault();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email).catch(() => { });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = email;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
      } catch { }
      document.body.removeChild(textArea);
    }

    // Attempt to trigger mail client as well
    window.location.href = `mailto:${email}`;

    setToastMessage(`${label} copied! (${email})`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/assets/logo-variations/contrast/Long%20Contrast.svg" alt="Velocity Swimming Logo" className="footer-logo" />
            <p className="footer-mission">
              Promoting the development of life skills through the sport of swimming in the greater Wenatchee Valley.
            </p>
          </div>

          <div className="footer-links">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="https://www.gomotionapp.com/team/ievs/page/online-registration1" target="_blank" rel="noopener noreferrer">SportsEngine Registration</a></li>
              <li><a href="https://www.gomotionapp.com/team/ievs/page/practice-calendar/practice-calendar1" target="_blank" rel="noopener noreferrer">Current Schedules</a></li>
            </ul>
          </div>

          <div className="footer-contact">
            <h4>Contact Us</h4>
            <p><strong>PO Box 2791</strong><br />Wenatchee, WA 98807</p>
            <div className="contact-emails">
              <a
                href="mailto:execboard@velocity-swimming.com"
                onClick={(e) => handleCopyEmail(e, "execboard@velocity-swimming.com", "Board email")}
                title="Click to copy & email"
              >
                execboard@velocity-swimming.com
              </a>
              <a
                href="mailto:coachaudrey@velocity-swimming.com"
                onClick={(e) => handleCopyEmail(e, "coachaudrey@velocity-swimming.com", "Coach Audrey's email")}
                title="Click to copy & email"
              >
                coachaudrey@velocity-swimming.com
              </a>
              <a
                href="mailto:coachchristian@velocity-swimming.com"
                onClick={(e) => handleCopyEmail(e, "coachchristian@velocity-swimming.com", "Coach Christian's email")}
                title="Click to copy & email"
              >
                coachchristian@velocity-swimming.com
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Velocity Swimming. All rights reserved.</p>

          <div className="theme-switcher" role="radiogroup" aria-label="Theme preference">
            <button
              type="button"
              className={`theme-btn ${themePreference === "system" ? "active" : ""}`}
              onClick={() => handleThemeChange("system")}
              title="System appearance"
              aria-label="Use system color theme"
              aria-checked={themePreference === "system"}
              role="radio"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span>System</span>
            </button>
            <button
              type="button"
              className={`theme-btn ${themePreference === "light" ? "active" : ""}`}
              onClick={() => handleThemeChange("light")}
              title="Light theme"
              aria-label="Use light color theme"
              aria-checked={themePreference === "light"}
              role="radio"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Light</span>
            </button>
            <button
              type="button"
              className={`theme-btn ${themePreference === "dark" ? "active" : ""}`}
              onClick={() => handleThemeChange("dark")}
              title="Dark theme"
              aria-label="Use dark color theme"
              aria-checked={themePreference === "dark"}
              role="radio"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <span>Dark</span>
            </button>
          </div>

          <div className="footer-legal-links">
            <Link href="/privacy">Privacy Policy</Link>
            <span className="footer-legal-divider">&bull;</span>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </div>

      </div>

      {toastMessage && (
        <div className="copy-toast" role="alert" aria-live="polite">
          <span className="copy-toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </footer>
  );
}