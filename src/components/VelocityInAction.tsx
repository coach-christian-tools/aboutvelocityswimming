import "./VelocityInAction.css";
import ImageWithLightbox from "./ImageWithLightbox";

export default function VelocityInAction() {
  return (
    <section id="programs" className="section velocity-action">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="section-title centered">Velocity in Action</h2>
          <p className="lead-text centered">
            Our athletes don't just succeed in the pool; they make an impact in our community.
          </p>
        </div>

        <div className="action-grid">
          <div className="action-card glass-panel">
            <div className="action-img-container">
              <ImageWithLightbox src="/assets/photos/whs-seniors.jpeg" alt="Athlete spotlight" className="action-img action-img-spotlight" />
            </div>
            <div className="action-content">
              <h3>Athlete Spotlights</h3>
              <p>
                "Swimming with Velocity taught me that hard work isn't just about winning medals; it's about pushing past your own limitations. The coaches believed in me before I believed in myself."
              </p>
              <span className="testimonial-author">— Velocity Senior Athlete</span>
            </div>
          </div>

          <div className="action-card glass-panel">
            <div className="action-img-container">
              <ImageWithLightbox src="/assets/photos/hike.jpg" alt="Community impact" className="action-img" />
            </div>
            <div className="action-content">
              <h3>Beyond the Pool</h3>
              <p>
                From volunteering at the Serve Wenatchee Valley food drive to completing our 5-mile cancer research endurance swim, our team is dedicated to giving back and developing true citizens.
              </p>
              <a href="#" className="text-link">Read our community stories &rarr;</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
