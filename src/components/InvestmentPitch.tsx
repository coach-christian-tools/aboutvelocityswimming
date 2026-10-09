"use client";

import { useState } from "react";
import styles from "./InvestmentPitch.module.css";
import { scopedClasses } from "@/lib/styles";

const SPONSORSHIP_TIERS = [
  {
    name: "Community Supporter",
    price: "$250 – $499",
    period: "per year",
    badge: null,
    highlight: false,
    description: "Essential local visibility supporting team equipment and youth programs.",
    benefits: [
      "Logo on website and social media",
      "On annual team spirit shirts",
      "On Eastmont Aquatic Center sponsorship board",
    ],
  },
  {
    name: "Gold Sponsor",
    price: "$500 – $900",
    period: "per year",
    badge: "Great Value",
    highlight: false,
    description: "Expanded brand exposure across all home meet programs and banners.",
    benefits: [
      "All Community Supporter benefits plus",
      "Inclusion on team banner",
      "Ads in all home meet programs (1,000+ eyes)",
    ],
  },
  {
    name: "Platinum Sponsor",
    price: "$1,000 – $2,999",
    period: "per year",
    badge: "High Impact",
    highlight: true,
    description: "Premium on-site presence and direct member marketing reach.",
    benefits: [
      "All Gold Sponsor benefits plus",
      "Daily recognition at each home swim meet",
      "Opportunity to distribute marketing materials with your logo to Velocity Swimming members and at all hosted meets",
    ],
  },
  {
    name: "Meet Sponsor",
    price: "$10,000",
    period: "exclusive",
    badge: "Exclusive",
    highlight: false,
    isMeetSponsor: true,
    tagline: "Exclusive meet sponsorship and naming rights",
    description: "Title sponsorship of a multi-day championship meet with maximum regional reach.",
    benefits: [
      "All other sponsor benefits plus",
      "Recognition as the lone sponsor of a multi-day meet",
      "Name prominently featured in all meet-related materials and promos",
    ],
  },
];

export default function InvestmentPitch() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleContactBoard = (e: React.MouseEvent) => {
    e.preventDefault();
    const email = "execboard@velocity-swimming.com";

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

    window.location.href = `mailto:${email}?subject=Velocity%20Swimming%20Sponsorship%20Inquiry`;

    setToastMessage(`Board email copied! (${email})`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  return (
    <section id="sponsors" className={scopedClasses(styles, 'section investment-pitch')}>
      <div className={scopedClasses(styles, 'container')}>
        {/* Section Header */}
        <div className={scopedClasses(styles, 'text-center mb-12')}>
          <span className={scopedClasses(styles, 'section-badge')}>Partnership Opportunities</span>
          <h1 className={scopedClasses(styles, 'section-title centered')}>Invest in Our Community</h1>
          <p className={scopedClasses(styles, 'lead-text centered max-w-3xl')}>
            Supporting Velocity Swimming is an investment in the future of the Wenatchee Valley youth and a high-visibility partnership for your business.
          </p>
        </div>

        {/* Why Partner Overview Banner */}
        <div className={scopedClasses(styles, 'pitch-overview-card glass-panel mb-12')}>
          <div className={scopedClasses(styles, 'overview-content')}>
            <h3>Why Partner With Velocity Swimming?</h3>
            <p>
              By sponsoring our club, you are directly supporting the physical and mental development of hundreds of local youth. Your brand will be associated with a health-oriented community pillar dedicated to excellence, character, and resilience.
            </p>
          </div>
          <div className={scopedClasses(styles, 'stats-grid')}>
            <div className={scopedClasses(styles, 'stat-item')}>
              <span className={scopedClasses(styles, 'stat-number')}>40+</span>
              <span className={scopedClasses(styles, 'stat-label')}>Years of History</span>
            </div>
            <div className={scopedClasses(styles, 'stat-item')}>
              <span className={scopedClasses(styles, 'stat-number')}>1,000+</span>
              <span className={scopedClasses(styles, 'stat-label')}>Meet Program Eyes</span>
            </div>
            <div className={scopedClasses(styles, 'stat-item')}>
              <span className={scopedClasses(styles, 'stat-number')}>100s</span>
              <span className={scopedClasses(styles, 'stat-label')}>Local Families Reached</span>
            </div>
          </div>
        </div>

        {/* Sponsorship Tiers Grid */}
        <div className={scopedClasses(styles, 'sponsorship-grid')}>
          {SPONSORSHIP_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={scopedClasses(styles, `sponsorship-card ${tier.highlight ? "highlighted" : ""} ${tier.isMeetSponsor ? "meet-sponsor-card" : ""}`)}
            >
              {tier.badge && (
                <span className={scopedClasses(styles, `card-badge ${tier.isMeetSponsor ? "badge-exclusive" : ""}`)}>
                  {tier.badge}
                </span>
              )}
              <div className={scopedClasses(styles, 'card-header')}>
                <h3 className={scopedClasses(styles, 'tier-title')}>{tier.name}</h3>
                {tier.tagline && <p className={scopedClasses(styles, 'tier-tagline')}>{tier.tagline}</p>}
                <div className={scopedClasses(styles, 'tier-price-wrapper')}>
                  <span className={scopedClasses(styles, 'tier-price')}>{tier.price}</span>
                  {tier.period && <span className={scopedClasses(styles, 'tier-period')}>/ {tier.period}</span>}
                </div>
                <p className={scopedClasses(styles, 'tier-description')}>{tier.description}</p>
              </div>

              <div className={scopedClasses(styles, 'card-divider')} />

              <div className={scopedClasses(styles, 'card-body')}>
                <span className={scopedClasses(styles, 'benefits-label')}>Included Benefits:</span>
                <ul className={scopedClasses(styles, 'tier-benefits-list')}>
                  {tier.benefits.map((benefit, idx) => (
                    <li key={idx} className={scopedClasses(styles, 'benefit-item')}>
                      <svg
                        className={scopedClasses(styles, 'check-icon-svg')}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Validity & CTA Footer */}
        <div className={scopedClasses(styles, 'sponsorship-validity-banner')}>
          <div className={scopedClasses(styles, 'validity-info')}>
            <span className={scopedClasses(styles, 'validity-icon')}>🗓️</span>
            <div>
              <p className={scopedClasses(styles, 'validity-title')}>
                <strong>Annual Term:</strong> Sponsorship is valid for 1 year from September to August.
              </p>
              <p className={scopedClasses(styles, 'validity-subtitle')}>
                Interested in supporting our team? Connect with our board to set up your sponsorship.
              </p>
            </div>
          </div>
          <div className={scopedClasses(styles, 'validity-cta')}>
            <a
              href="mailto:execboard@velocity-swimming.com?subject=Velocity%20Swimming%20Sponsorship%20Inquiry"
              onClick={handleContactBoard}
              className={scopedClasses(styles, 'btn btn-primary')}
            >
              Contact the Board to Sponsor
            </a>
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



