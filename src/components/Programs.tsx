"use client";

import { useState } from "react";
import styles from "./Programs.module.css";
import { scopedClasses } from "@/lib/styles";

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
    <section id="programs" className={scopedClasses(styles, 'section programs-section')}>
      <div className={scopedClasses(styles, 'container')}>
        {/* Section Header */}
        <div className={scopedClasses(styles, 'text-center mb-12')}>
          <span className={scopedClasses(styles, 'section-badge')}>Programs & Pathways</span>
          <h2 className={scopedClasses(styles, 'section-title centered')}>Team Divisions & Training Groups</h2>
          <p className={scopedClasses(styles, 'lead-text centered max-w-3xl')}>
            From first-time swimmers mastering the water to athletes competing on the national stage, Velocity Swimming provides structured pathways for every age and ambition.
          </p>
        </div>

        {/* Divisions Cards Grid */}
        <div className={scopedClasses(styles, 'divisions-grid mb-16')}>
          {DIVISIONS.map((div) => (
            <div key={div.id} className={scopedClasses(styles, `division-card ${div.id === "competitive" ? "featured-division" : ""}`)}>
              <div className={scopedClasses(styles, 'division-header')}>
                <span className={scopedClasses(styles, 'division-badge')}>{div.badge}</span>
                <h3 className={scopedClasses(styles, 'division-title')}>{div.name}</h3>
                <p className={scopedClasses(styles, 'division-summary')}>{div.summary}</p>
              </div>

              <div className={scopedClasses(styles, 'division-groups')}>
                <span className={scopedClasses(styles, 'groups-title')}>Training Groups</span>
                <div className={scopedClasses(styles, 'groups-list')}>
                  {div.groups.map((group) => (
                    <div key={group.name} className={scopedClasses(styles, 'group-pill-card')}>
                      <div className={scopedClasses(styles, 'group-head')}>
                        <strong>{group.name}</strong>
                        <span className={scopedClasses(styles, 'group-age')}>{group.age}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={scopedClasses(styles, 'division-footer-meta')}>
                <div className={scopedClasses(styles, 'meta-item')}>
                  <span className={scopedClasses(styles, 'meta-label')}>Commitment:</span> {div.commitment}
                </div>
                <div className={scopedClasses(styles, 'meta-item')}>
                  <span className={scopedClasses(styles, 'meta-label')}>Placement:</span> {div.entry}
                </div>
              </div>
            </div>

          ))}
        </div>


        {/* Registration Process & CTA */}
        <div id="join" className={scopedClasses(styles, 'registration-flow-card glass-panel')}>
          <div className={scopedClasses(styles, 'flow-header text-center')}>
            <span className={scopedClasses(styles, 'flow-badge')}>Get Started</span>
            <h3>How to Join Velocity Swimming</h3>
            <p>Ready to jump into the pool? Follow our 3-step registration process to get placed and cleared for practice.</p>
          </div>

          <div className={scopedClasses(styles, 'steps-grid')}>
            <div className={scopedClasses(styles, 'step-card')}>
              <div className={scopedClasses(styles, 'step-number')}>1</div>
              <h4>Review Policies</h4>
              <p>
                Familiarize yourself with our team culture, safety guidelines, and the <strong>C.A.R.E. Charter</strong> (Control, Accountability, Respect, Effort).
              </p>
            </div>

            <div className={scopedClasses(styles, 'step-card')}>
              <div className={scopedClasses(styles, 'step-number')}>2</div>
              <h4>Schedule a Tryout</h4>
              <p>
                New swimmers attend a quick placement evaluation:
              </p>
              <div className={scopedClasses(styles, 'tryout-links')}>
                <a
                  href="mailto:coachaudrey@velocity-swimming.com"
                  onClick={(e) => handleCopyEmail(e, "coachaudrey@velocity-swimming.com", "Coach Audrey's email")}
                  className={scopedClasses(styles, 'tryout-btn')}
                >
                  <strong>12 & Under:</strong> Email Coach Audrey
                </a>
                <a
                  href="mailto:coachchristian@velocity-swimming.com"
                  onClick={(e) => handleCopyEmail(e, "coachchristian@velocity-swimming.com", "Coach Christian's email")}
                  className={scopedClasses(styles, 'tryout-btn')}
                >
                  <strong>13 & Over:</strong> Email Coach Christian
                </a>
                <span className={scopedClasses(styles, 'masters-note')}>
                  <em><strong>Masters (19+):</strong> No test required — drop in to a practice!</em>
                </span>
              </div>
            </div>

            <div className={scopedClasses(styles, 'step-card')}>
              <div className={scopedClasses(styles, 'step-number')}>3</div>
              <h4>Complete Clearance</h4>
              <p>
                Sign your Division Agreement, submit registration fees, and complete your clearance on our SportsEngine platform.
              </p>
              <div className={scopedClasses(styles, 'mt-4')}>
                <a
                  href="https://www.gomotionapp.com/team/ievs/page/online-registration1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={scopedClasses(styles, 'btn btn-primary w-full register-cta-btn')}
                >
                  Register on SportsEngine &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className={scopedClasses(styles, 'copy-toast')} role="alert" aria-live="polite">
          <span className={scopedClasses(styles, 'copy-toast-icon')}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </section>
  );
}
