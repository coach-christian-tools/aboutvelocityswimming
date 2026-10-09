import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import styles from "../privacy/privacy.module.css";
import { scopedClasses } from "@/lib/styles";

export const metadata: Metadata = {
  title: "Terms of Service | Velocity Swimming",
  description: "Terms of Service and website usage policies for Velocity Swimming.",
};

export default function TermsOfService() {
  return (
    <>

      <main className={scopedClasses(styles, "legal-page")}>
        <div className={scopedClasses(styles, "container")}>
          <div className={scopedClasses(styles, "legal-header")}>
            <Link href="/" className={scopedClasses(styles, "back-link")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Back to Home</span>
            </Link>
            <div className={scopedClasses(styles, "legal-title-block")}>
              <span className={scopedClasses(styles, "section-badge")}>Legal &amp; Transparency</span>
              <h1>Terms of Service</h1>
              <p className={scopedClasses(styles, "last-updated")}>Last Updated: August 2026</p>
            </div>
          </div>


          <div className={scopedClasses(styles, "legal-content glass-panel")}>
            <section className={scopedClasses(styles, "legal-section")}>
              <h2>1. Agreement to Terms</h2>
              <p>
                By accessing and using this website (<code>velocity-swimming.com</code> / <code>aboutvelocityswimming</code>), you agree to be bound by these Terms of Service. If you do not agree with these terms, please do not use this website.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>2. Informational Purpose &amp; Membership Governance</h2>
              <p>
                This website is maintained by Velocity Swimming, a Washington 501(c)(3) nonprofit corporation, for informational purposes regarding our swim programs, leadership, meet schedules, and sponsorship opportunities.
              </p>
              <p>
                <strong>Athlete Participation &amp; Team Policies:</strong> Actual participation in Velocity Swimming practices, meets, and activities is strictly governed by our official <strong>Team Handbook</strong>, <strong>C.A.R.E. Charter</strong>, <strong>Division Agreements</strong>, and <strong>Financial Policies</strong> executed via SportsEngine upon registration.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>3. Intellectual Property Rights</h2>
              <p>
                All content on this website—including but not limited to the Velocity Swimming name, logos, graphics, text, images, and brand design—is the property of Velocity Swimming and protected under applicable copyright and trademark laws. You may not reproduce, distribute, or modify any content without prior written permission from Velocity Swimming.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>4. Third-Party Links &amp; Services</h2>
              <p>
                This website contains links to third-party platforms, including <strong>SportsEngine</strong> (for registration, billing, and meet entries), <strong>USA Swimming</strong>, <strong>Inland Empire Swimming (IES)</strong>, and <strong>US Masters Swimming (USMS)</strong>.
              </p>
              <p>
                Velocity Swimming is not responsible for the availability, accuracy, content, or privacy practices of these external websites. Your interactions with third-party sites are governed by their respective terms and policies.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>5. Disclaimers &amp; Limitation of Liability</h2>
              <p>
                This website is provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis. While we strive to maintain accurate program and schedule information, schedules and pool availability may change due to facility constraints. Velocity Swimming shall not be liable for any direct or indirect damages resulting from the use of, or inability to use, this website.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>6. Governing Law</h2>
              <p>
                These Terms of Service shall be governed by and construed in accordance with the laws of the State of Washington, without regard to its conflict of law principles.
              </p>
            </section>

            <section className={scopedClasses(styles, "legal-section")}>
              <h2>7. Contact Information</h2>
              <p>
                For questions regarding these Terms of Service, please contact our Board of Directors:
              </p>
              <div className={scopedClasses(styles, "contact-card")}>
                <p><strong>Velocity Swimming Executive Board</strong></p>
                <p>PO Box 2791, Wenatchee, WA 98807</p>
                <p>
                  Email: <a href="mailto:execboard@velocity-swimming.com" className={scopedClasses(styles, "legal-link")}>execboard@velocity-swimming.com</a>
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
