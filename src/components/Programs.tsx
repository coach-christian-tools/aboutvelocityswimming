"use client";

import { useState } from "react";
import "./Programs.css";

const DIVISIONS = [
  {
    id: "development",
    name: "Development Division",
    badge: "Learn to Race",
    summary: "Designed for our youngest swimmers to build water safety, stroke competence, and comfort in a team environment.",
    commitment: "Monthly commitment • 2 days/week practices",
    entry: "Requires a 25-yard swim test with Coach Audrey for placement",
    groups: [
      {
        name: "Splash",
        age: "12 & Under",
      },
      {
        name: "Pre-Team",
        age: "12 & Under",
      },
    ],
  },
  {
    id: "recreation",
    name: "Recreation Division",
    badge: "Fitness & Fun",
    summary: "A structured, encouraging environment for swimmers who want fitness and stroke refinement without a heavy travel competition schedule.",
    commitment: "Monthly commitment • 2 days/week practices • Optional local home meets",
    entry: "Requires safety & skills assessment with Coach Audrey",
    groups: [
      {
        name: "18&U Rec Group",
        age: "18 & Under",
      },
    ],
  },
  {
    id: "competitive",
    name: "Competitive Division",
    badge: "USA Swimming",
    summary: "Velocity's premiere year-round competitive squad dedicated to race execution, athletic mastery, and character development.",
    commitment: "Annual commitment (11 months Sept–July) • 4+ days/week • Required local meets & workshare",
    entry: "Placement determined by Co-Head Coaches based on age, skill, and training capacity",
    groups: [
      {
        name: "10&U Prep",
        age: "10 & Under",
      },
      {
        name: "Age Groupers",
        age: "Ages 10–12",
      },
      {
        name: "Juniors",
        age: "Ages 13–14",
      },
      {
        name: "Seniors",
        age: "Ages 15 & Over",
      },
    ],
  },
  {
    id: "masters",
    name: "Masters Division",
    badge: "Adult Swimming",
    summary: "Organized, coached workouts for adult swimmers, fitness enthusiasts, triathletes, and former competitive swimmers.",
    commitment: "Monthly commitment • 3 days/week practices • Modest 8-hr workshare",
    entry: "Active USMS membership required • Drop in to any practice to get started",
    groups: [
      {
        name: "VS Masters",
        age: "19 & Over",
      },
    ],
  },
];

export default function Programs() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleCopyEmail = (e: React.MouseEvent, email: string, label: string) => {
    e.preventDefault();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email).catch(() => {});
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = email;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(textArea);
    }

    window.location.href = `mailto:${email}`;

    setToastMessage(`${label} copied! (${email})`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  return (
    <section id="programs" className="section programs-section">
      <div className="container">
        {/* Section Header */}
        <div className="text-center mb-12">
          <span className="section-badge">Programs & Pathways</span>
          <h2 className="section-title centered">Team Divisions & Training Groups</h2>
          <p className="lead-text centered max-w-3xl">
            From first-time swimmers mastering the water to athletes competing on the national stage, Velocity Swimming provides structured pathways for every age and ambition.
          </p>
        </div>

        {/* Divisions Cards Grid */}
        <div className="divisions-grid mb-16">
          {DIVISIONS.map((div) => (
            <div key={div.id} className={`division-card ${div.id === "competitive" ? "featured-division" : ""}`}>
              <div className="division-header">
                <span className="division-badge">{div.badge}</span>
                <h3 className="division-title">{div.name}</h3>
                <p className="division-summary">{div.summary}</p>
              </div>

              <div className="division-groups">
                <span className="groups-title">Training Groups</span>
                <div className="groups-list">
                  {div.groups.map((group) => (
                    <div key={group.name} className="group-pill-card">
                      <div className="group-head">
                        <strong>{group.name}</strong>
                        <span className="group-age">{group.age}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="division-footer-meta">
                <div className="meta-item">
                  <span className="meta-label">Commitment:</span> {div.commitment}
                </div>
                <div className="meta-item">
                  <span className="meta-label">Placement:</span> {div.entry}
                </div>
              </div>
            </div>

          ))}
        </div>


        {/* Registration Process & CTA */}
        <div id="join" className="registration-flow-card glass-panel">
          <div className="flow-header text-center">
            <span className="flow-badge">Get Started</span>
            <h3>How to Join Velocity Swimming</h3>
            <p>Ready to jump into the pool? Follow our 3-step registration process to get placed and cleared for practice.</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h4>Review Policies</h4>
              <p>
                Familiarize yourself with our team culture, safety guidelines, and the <strong>C.A.R.E. Charter</strong> (Control, Accountability, Respect, Effort).
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <h4>Schedule a Tryout</h4>
              <p>
                New swimmers attend a quick placement evaluation:
              </p>
              <div className="tryout-links">
                <a
                  href="mailto:coachaudrey@velocity-swimming.com"
                  onClick={(e) => handleCopyEmail(e, "coachaudrey@velocity-swimming.com", "Coach Audrey's email")}
                  className="tryout-btn"
                >
                  <strong>12 & Under:</strong> Email Coach Audrey
                </a>
                <a
                  href="mailto:coachchristian@velocity-swimming.com"
                  onClick={(e) => handleCopyEmail(e, "coachchristian@velocity-swimming.com", "Coach Christian's email")}
                  className="tryout-btn"
                >
                  <strong>13 & Over:</strong> Email Coach Christian
                </a>
                <span className="masters-note">
                  <em><strong>Masters (19+):</strong> No test required — drop in to a practice!</em>
                </span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <h4>Complete Clearance</h4>
              <p>
                Sign your Division Agreement, submit registration fees, and complete your clearance on our SportsEngine platform.
              </p>
              <div className="mt-4">
                <a
                  href="https://www.gomotionapp.com/team/ievs/page/online-registration1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-full register-cta-btn"
                >
                  Register on SportsEngine &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="copy-toast" role="alert" aria-live="polite">
          <span className="copy-toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </section>
  );
}
