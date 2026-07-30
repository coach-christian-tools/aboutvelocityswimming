"use client";

import "./Leadership.css";
import ImageWithLightbox from "./ImageWithLightbox";

export default function Leadership() {
  return (
    <section id="coaches" className="section leadership">
      <div className="container">
        <div className="leadership-header text-center mb-12">
          <h2 className="section-title centered text-light">Leadership Philosophy</h2>
          <p className="lead-text centered text-light-muted">
            Meet the visionaries guiding the next generation of Wenatchee Valley swimmers.
          </p>
        </div>

        <div className="coaches-grid">
          <div className="coach-card glass-panel dark-glass">
            
            <div className="coach-collage audrey-collage">
              <div className="collage-accent-blob"></div>
              <ImageWithLightbox src="/assets/photos/audrey-eddings.jpeg" alt="Coach Audrey with Eddings" className="collage-img img-1" />
              <ImageWithLightbox src="/assets/photos/audrey-fun.jpeg" alt="Coach Audrey having fun" className="collage-img img-2" />
              <ImageWithLightbox src="/assets/photos/audrey-ribellia.jpeg" alt="Coach Audrey with Ribellia" className="collage-img img-3" />
            </div>

            <div className="coach-info">
              <h3 className="coach-name">Audrey Hyde</h3>
              <p className="coach-role">Co-Head Coach (12 & Under)</p>
            </div>
            
            <div className="qa-section">
              <div className="qa-item">
                <h4>What does success look like for developing swimmers?</h4>
                <p>
                  "Success isn't measured by a stopwatch at this age. It's measured by their excitement to come to practice, their willingness to try hard things, and the friendships they build in the water."
                </p>
              </div>
              <div className="qa-item">
                <h4>How do we prevent burnout?</h4>
                <p>
                  "By keeping it fun and focusing on long-term athletic development. We prioritize stroke technique and a love for the sport over yardage."
                </p>
              </div>
            </div>
          </div>

          <div className="coach-card glass-panel dark-glass">
            
            <div className="coach-collage christian-collage">
              <div className="collage-accent-blob"></div>
              <ImageWithLightbox src="/assets/photos/cutter-spartan.jpeg" alt="Coach Christian Spartan" className="collage-img img-1" />
              <ImageWithLightbox src="/assets/photos/cutter-smile.JPG" alt="Coach Christian Smiling" className="collage-img img-2" />
              <ImageWithLightbox src="/assets/photos/cutter-huddle.JPG" alt="Coach Christian Huddle" className="collage-img img-3" />
            </div>

            <div className="coach-info">
              <h3 className="coach-name">Christian Cutter</h3>
              <p className="coach-role">Co-Head Coach (13 & Over / Masters)</p>
            </div>

            <div className="qa-section">
              <div className="qa-item">
                <h4>What is the core philosophy for senior athletes?</h4>
                <p>
                  "Empowerment. We want our senior athletes to take ownership of their goals, understand the 'why' behind the sets, and learn to race with confidence and character."
                </p>
              </div>
              <div className="qa-item">
                <h4>How does the team prepare swimmers for life?</h4>
                <p>
                  "Swimming is the ultimate teacher of delayed gratification. The resilience they build staring at that black line translates directly to their academics and future careers."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
