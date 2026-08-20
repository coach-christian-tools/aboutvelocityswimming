import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy Policy | Velocity Swimming",
  description: "Privacy Policy and data protection guidelines for Velocity Swimming in the Wenatchee Valley.",
};

export default function PrivacyPolicy() {
  return (
    <>
      <Header darkBackground={true} />
      <main className="legal-page">
        <div className="container">
          <div className="legal-header">
            <Link href="/" className="back-link">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Back to Home</span>
            </Link>
            <div className="legal-title-block">
              <span className="section-badge">Legal &amp; Transparency</span>
              <h1>Privacy Policy</h1>
              <p className="last-updated">Last Updated: August 2026</p>
            </div>
          </div>


          <div className="legal-content glass-panel">
            <section className="legal-section">
              <h2>1. Introduction</h2>
              <p>
                Velocity Swimming (&ldquo;Velocity,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a family-oriented, 501(c)(3) nonprofit youth and adult aquatics organization serving the Wenatchee Valley and North Central Washington. We are committed to protecting the privacy and safety of our athletes, families, coaches, and website visitors.
              </p>
              <p>
                This Privacy Policy describes how we collect, use, and handle information through our informational website (<code>velocity-swimming.com</code> / <code>aboutvelocityswimming</code>).
              </p>
            </section>

            <section className="legal-section">
              <h2>2. Information We Collect</h2>
              <p>
                We minimize the collection of personal data on this informational website:
              </p>
              <ul>
                <li>
                  <strong>Direct Inquiries:</strong> If you contact our coaching staff or board via email (e.g., to schedule a tryout or ask about sponsorship), we collect your name, email address, and message content solely to respond to your inquiry.
                </li>
                <li>
                  <strong>Technical &amp; Log Data:</strong> Like most websites, our web hosting servers automatically record basic technical data such as browser type, operating system, referring URL, and approximate timestamp to ensure reliable site performance and security.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>3. Third-Party Platforms &amp; Member Registration</h2>
              <p>
                To provide safe, comprehensive club management and secure payments, Velocity Swimming partners with specialized third-party services:
              </p>
              <ul>
                <li>
                  <strong>SportsEngine (by NBC Sports Next):</strong> All official athlete registration, division agreements, practice rosters, emergency contacts, billing, and payment transactions are managed securely through the SportsEngine platform. Information submitted during registration is subject to the <a href="https://www.sportsengine.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="legal-link">SportsEngine Privacy Policy</a>.
                </li>
                <li>
                  <strong>Social Media (Instagram / Meta):</strong> Embedded social media posts and widgets are hosted by Instagram and operate in accordance with Meta&rsquo;s privacy terms.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>4. Minor Athlete Safety &amp; SafeSport Compliance</h2>
              <p>
                The safety of our youth athletes is our highest priority. In full alignment with <strong>USA Swimming SafeSport</strong> and the <strong>Minor Athlete Abuse Prevention Policy (MAAPP)</strong>:
              </p>
              <ul>
                <li>We do not knowingly collect personal information directly from minor children online.</li>
                <li>All digital and electronic communications involving minor athletes require parental inclusion or copying.</li>
                <li>
                  <strong>Photography &amp; Media Policy:</strong> Photographs and videos of minor athletes published on our website or social media are strictly celebratory of athletic achievements and community events. In accordance with our Team Handbook, parents/guardians retain the absolute right to request the non-publication or immediate removal of photos/videos of their child by submitting a Photo Removal Request to our board.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>5. Information Sharing &amp; Disclosure</h2>
              <p>
                Velocity Swimming <strong>does not sell, rent, or trade</strong> your personal information to third-party marketers or advertisers. We only share information when required by law, in emergency situations to protect athlete safety, or with authorized governing bodies (such as USA Swimming or Inland Empire Swimming) in connection with sanctioned athletic events.
              </p>
            </section>

            <section className="legal-section">
              <h2>6. Contact Us</h2>
              <p>
                If you have questions regarding this Privacy Policy, your personal information, or wish to submit a photo removal request, please contact our Executive Board:
              </p>
              <div className="contact-card">
                <p><strong>Velocity Swimming Executive Board</strong></p>
                <p>PO Box 2791, Wenatchee, WA 98807</p>
                <p>
                  Email: <a href="mailto:execboard@velocity-swimming.com" className="legal-link">execboard@velocity-swimming.com</a>
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
