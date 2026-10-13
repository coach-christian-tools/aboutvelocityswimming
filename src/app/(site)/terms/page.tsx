import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import styles from "../privacy/privacy.module.css";
import { scopedClasses } from "@/lib/styles";

export const metadata: Metadata = {
  title: "Terms of Service | Velocity Swimming",
  description:
    "Terms of Service and website usage policies for Velocity Swimming.",
};

export default function TermsOfService() {
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
              <h1>Terms of Service</h1>
              <p className={scopedClasses(styles, "last-updated")}>
                Last Updated: October 13, 2026
              </p>
            </div>
          </div>

          <div className={scopedClasses(styles, "legal-content glass-panel")}>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>1. Agreement and Scope</h2>
              <p>
                By using the Velocity Swimming website, accounts, team tools, or
                online store, you agree to these Terms of Service. If you do not
                agree, please do not use these services. Our{" "}
                <Link
                  href="/privacy"
                  className={scopedClasses(styles, "legal-link")}
                >
                  Privacy Policy
                </Link>{" "}
                explains how information is handled.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>2. Team Membership and Participation</h2>
              <p>
                The website provides program information, schedules, swimming
                results, volunteer coordination, member tools, and merchandise
                sales. Creating a website account does not by itself register an
                athlete, establish team membership, or grant access to
                restricted records.
              </p>
              <p>
                Participation in practices, meets, and team activities remains
                governed by the applicable Team Handbook, C.A.R.E. Charter,
                Division Agreements, Financial Policies, and registration
                requirements. Parents or guardians are responsible for managing
                registrations and permissions for their children.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>3. Accounts and Acceptable Use</h2>
              <p>
                Provide accurate information, protect your sign-in credentials,
                and use only the accounts and household records you are
                authorized to access. Contact us if you suspect unauthorized
                access or an incorrect household association.
              </p>
              <ul>
                <li>
                  Do not impersonate another person, misrepresent membership, or
                  share access to restricted tools.
                </li>
                <li>
                  Do not attempt to bypass access controls, disrupt the service,
                  introduce malicious code, or collect private information about
                  other families.
                </li>
                <li>
                  Keep volunteer signups and submitted hours accurate. Workshare
                  credits and corrections remain subject to team review and
                  applicable team policies.
                </li>
                <li>
                  Submit only information you are authorized to provide, and do
                  not use team information to harass, solicit, or harm others.
                </li>
              </ul>
              <p>
                We may restrict account access to address misuse, security
                concerns, or changes in eligibility.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>4. Schedules, Results, and Team Tools</h2>
              <p>
                Schedules, volunteer opportunities, imported results, rankings,
                and calculated records may change or contain errors. Confirm
                event details with the team or organizer and report
                discrepancies to us. Website calculations do not replace
                official meet results, governing-body qualification rules, or
                team decisions.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>5. Store Orders</h2>
              <p>
                Review your selected product, size, delivery address, price, and
                shipping charges before paying. Store checkout is processed by
                Stripe, and paid merchandise orders are sent to Printful for
                fulfillment. Shipping estimates are estimates, and availability
                or delivery may be affected by production or carrier delays.
              </p>
              <p>
                For an incorrect, damaged, missing, or otherwise disputed order,
                or a cancellation or refund request, contact the Executive Board
                with your order reference. Available remedies depend on the
                order circumstances, any terms presented with the purchase, and
                applicable law. Nothing in these terms limits consumer rights
                that cannot legally be waived.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>6. Website Content and Third-Party Services</h2>
              <p>
                Velocity Swimming content, logos, photographs, and branding
                belong to Velocity Swimming or their respective owners. Do not
                reproduce or distribute protected content without permission,
                except as permitted by applicable law. Public access to athlete
                information does not authorize misuse of that information.
              </p>
              <p>
                The site uses or links to services including SportsEngine,
                Supabase, Google, Stripe, Printful, Instagram, USA Swimming,
                Inland Empire Swimming, and US Masters Swimming. Third-party
                services have their own terms and privacy practices, and we do
                not control their availability or external content.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>7. Availability and Liability</h2>
              <p>
                The website and tools are provided on an &ldquo;as-is&rdquo; and
                &ldquo;as-available&rdquo; basis. We work to maintain accurate
                information and reliable access but do not guarantee
                uninterrupted service or error-free content. To the extent
                permitted by applicable law, Velocity Swimming is not liable for
                indirect or consequential losses arising from use of the
                website. These terms do not exclude liability or rights that
                applicable law does not allow us to exclude.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>8. Changes and Governing Law</h2>
              <p>
                We may update these terms as services change. The date above
                identifies the latest revision. These terms are governed by
                Washington State law, subject to any mandatory protections that
                apply to you.
              </p>
            </section>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>9. Contact Information</h2>
              <p>
                For questions about these terms, account access, or store
                orders, contact:
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
