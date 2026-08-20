"use client";

import { useState } from "react";
import Link from "next/link";
import "./Footer.css";


export default function Footer() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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