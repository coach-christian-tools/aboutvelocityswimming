import "./Footer.css";

export default function Footer() {
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
              <li><a href="https://velocity-swimming.com/schedules" target="_blank" rel="noopener noreferrer">Current Schedules</a></li>
            </ul>
          </div>

          <div className="footer-contact">
            <h4>Contact Us</h4>
            <p><strong>PO Box 2791</strong><br />Wenatchee, WA 98807</p>
            <div className="contact-emails">
              <a href="mailto:execboard@velocity-swimming.com">execboard@velocity-swimming.com</a>
              <a href="mailto:coachaudrey@velocity-swimming.com">coachaudrey@velocity-swimming.com</a>
              <a href="mailto:coachchristian@velocity-swimming.com">coachchristian@velocity-swimming.com</a>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Velocity Swimming. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
