import "./InvestmentPitch.css";

export default function InvestmentPitch() {
  return (
    <section id="sponsors" className="section investment-pitch">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="section-title centered">Invest in Our Community</h2>
          <p className="lead-text centered">
            Supporting Velocity Swimming is an investment in the future of the Wenatchee Valley and a smart business move.
          </p>
        </div>

        <div className="pitch-grid">
          <div className="roi-card glass-panel">
            <h3>Why Partner With Us?</h3>
            <p>
              By sponsoring our club, you are directly supporting the physical and mental development of hundreds of local youth. Your brand will be associated with a health-oriented community pillar dedicated to excellence and resilience.
            </p>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-number">40+</span>
                <span className="stat-label">Years of History</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">100s</span>
                <span className="stat-label">Local Families Reach</span>
              </div>
            </div>
          </div>

          <div className="tiers-card">
            <h3>Sponsorship Tiers</h3>
            <div className="tier-list">
              <div className="tier-item">
                <div className="tier-header">
                  <h4>Platinum Partner</h4>
                  <span className="tier-badge">Premium</span>
                </div>
                <p>Digital website real estate, prominent logo placement on team banners, and full-page mentions in all meet programs.</p>
              </div>
              <div className="tier-item">
                <div className="tier-header">
                  <h4>Gold Sponsor</h4>
                </div>
                <p>Logo on team banners, website footer placement, and half-page meet program mentions.</p>
              </div>
              <div className="tier-item">
                <div className="tier-header">
                  <h4>Community Supporter</h4>
                </div>
                <p>Website listing and quarter-page meet program mentions.</p>
              </div>
            </div>
            
            <a href="mailto:execboard@velocity-swimming.com" className="btn btn-primary w-full mt-6">Contact Us to Sponsor</a>
          </div>
        </div>
      </div>
    </section>
  );
}
