import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import styles from "./privacy.module.css";
import { scopedClasses } from "@/lib/styles";

export const metadata: Metadata = {
  title: "Privacy Policy | Velocity Swimming",
  description:
    "Privacy Policy and data protection guidelines for Velocity Swimming in the Wenatchee Valley.",
};

export default function PrivacyPolicy() {
  return (
    <>
      <main className={scopedClasses(styles, "legal-page")}>
        <div className={scopedClasses(styles, "container")}>
          <div className={scopedClasses(styles, "legal-header")}>
            <Link href="/" className={scopedClasses(styles, "back-link")}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Back to Home</span>
            </Link>
            <div className={scopedClasses(styles, "legal-title-block")}>
              <span className={scopedClasses(styles, "section-badge")}>
                Legal &amp; Transparency
              </span>
              <h1>Privacy Policy</h1>
              <p className={scopedClasses(styles, "last-updated")}>
                Last Updated: October 13, 2026
              </p>
            </div>
          </div>

          <div className={scopedClasses(styles, "legal-content glass-panel")}>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>1. Introduction</h2>
              <p>
                Velocity Swimming (&ldquo;Velocity,&rdquo; &ldquo;we,&rdquo;
                &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a nonprofit youth and
                adult aquatics organization serving the Wenatchee Valley and
                North Central Washington. This policy describes information
                handled through our website, accounts, team tools, and online
                store.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>2. Information We Collect</h2>
              <ul>
                <li>
                  <strong>Accounts and inquiries:</strong> Email address,
                  account identifiers, sign-in and verification information, and
                  information you provide when contacting us. If you choose
                  Google sign-in, we receive the account information needed to
                  authenticate you.
                </li>
                <li>
                  <strong>Team and household records:</strong> Names, contact
                  details, household and athlete associations, team membership,
                  volunteer shift signups, workshare hours, and related
                  administrative records supplied by families or authorized
                  staff.
                </li>
                <li>
                  <strong>Swimming records:</strong> Athlete names, age or age
                  group, competition category, team, events, times, and meet
                  results received from team records, staff imports, and
                  published competition sources.
                </li>
                <li>
                  <strong>Store orders:</strong> Product selections, order and
                  payment status, customer contact details, and billing and
                  shipping information provided during checkout. Stripe
                  processes card details; our website does not receive or store
                  full payment card numbers.
                </li>
                <li>
                  <strong>Technical data:</strong> Our hosting and service
                  providers may record IP addresses, browser and device
                  information, requested pages, timestamps, and error or
                  security logs.
                </li>
              </ul>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>3. How We Use Information</h2>
              <p>
                We use information to provide and secure accounts, connect users
                with their household and authorized tools, administer team and
                volunteer activities, display swimming results, process and
                fulfill orders, respond to inquiries, correct records, and
                maintain the website. Access to restricted tools depends on
                account permissions and verified team or household associations.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>4. Service Providers and Information Sharing</h2>
              <p>
                We use service providers to operate the site and deliver the
                services you request:
              </p>
              <ul>
                <li>
                  <strong>Account and data services:</strong> Supabase supports
                  authentication and storage of website and team-tool records.
                  Google supports optional Google sign-in.
                </li>
                <li>
                  <strong>Registration:</strong> SportsEngine handles official
                  team registration and related agreements and billing. Website
                  accounts and team-tool records are also maintained separately
                  from SportsEngine.
                </li>
                <li>
                  <strong>Store payments and fulfillment:</strong> Stripe
                  handles checkout. We send Printful the purchased items and
                  recipient name, shipping address, email, and phone number when
                  available to fulfill paid orders.
                </li>
                <li>
                  <strong>Social media:</strong> Instagram embeds connect your
                  browser to Meta services. Those services may receive technical
                  information and use cookies when embedded posts load, even if
                  you do not click a post.
                </li>
              </ul>
              <p>
                Provider practices are described in their own policies,
                including the{" "}
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={scopedClasses(styles, "legal-link")}
                >
                  Supabase Privacy Policy
                </a>
                ,{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={scopedClasses(styles, "legal-link")}
                >
                  Google Privacy Policy
                </a>
                ,{" "}
                <a
                  href="https://www.sportsengine.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={scopedClasses(styles, "legal-link")}
                >
                  SportsEngine Privacy Policy
                </a>
                , and{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={scopedClasses(styles, "legal-link")}
                >
                  Stripe Privacy Policy
                </a>
                .
              </p>
              <p>
                We do not sell or rent team or account records. Information may
                also be shared with authorized team personnel, governing bodies
                for athletic administration, or when needed to comply with law
                or protect safety. Public result pages and published team
                photographs can be viewed by visitors without an account.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>5. Cookies, Browser Storage, and Your Choices</h2>
              <p>
                Sign-in uses cookies to maintain your session. Browser storage
                remembers preferences such as your theme and tool layout. You
                can sign out and clear cookies or site storage in your browser;
                doing so may reset preferences or prevent account features from
                working. Third-party checkout and embedded content may use their
                own cookies and similar technologies under their policies.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>6. Young Athletes and Team Media</h2>
              <p>
                Parents or guardians should manage registration and household
                information for children. We handle information about young
                athletes supplied by families, authorized staff, and competition
                sources as described above. If you believe a child has submitted
                personal information without appropriate parent or guardian
                involvement, contact the Executive Board so we can review and
                address it.
              </p>
              <p>
                Team photographs and videos highlight athletic achievements and
                community events. Parents and guardians may request
                non-publication or removal of their child&rsquo;s media by
                contacting the Board. For a privacy concern involving a
                published result, identify the athlete, page, and information at
                issue. Removing information from this website does not remove
                copies held by competition organizers or other websites.
              </p>
              <p>
                Electronic communications with minor athletes must follow the
                team&rsquo;s applicable SafeSport and Minor Athlete Abuse
                Prevention Policy requirements, including parent or guardian
                involvement where required.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>7. Retention, Security, and Requests</h2>
              <p>
                Records are retained for team operations, account
                administration, order support, recordkeeping, and applicable
                legal obligations. Retention depends on the type of record and
                its purpose; signing out does not delete records. Access
                controls help protect restricted information, but no website or
                transmission method can guarantee complete security.
              </p>
              <p>
                You may contact the Board to request access to, correction of,
                or deletion of personal information, or to raise a concern about
                its use. We may need to verify your identity or authority to act
                for an athlete or household. Some records may need to be
                retained for legal, financial, safety, or recordkeeping reasons.
                Requests concerning another provider&rsquo;s independent records
                should also be directed to that provider.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>8. Updates and Contact</h2>
              <p>
                We may update this policy as our services or practices change.
                The date above identifies the latest revision. For privacy
                questions, record requests, or photo removal requests, contact:
              </p>
              <div className={scopedClasses(styles, "contact-card")}>
                <p>
                  <strong>Velocity Swimming Executive Board</strong>
                </p>
                <p>PO Box 2791, Wenatchee, WA 98807</p>
                <p>
                  Email:{" "}
                  <a
                    href="mailto:execboard@velocity-swimming.com"
                    className={scopedClasses(styles, "legal-link")}
                  >
                    execboard@velocity-swimming.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
