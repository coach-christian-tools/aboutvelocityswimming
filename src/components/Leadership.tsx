import { client, urlFor } from "../sanity/client";
import "./Leadership.css";
import Carousel from "./Carousel";

export const revalidate = 60;

const fallbackAudrey = [
  "/assets/photos/audrey-eddings.jpeg",
  "/assets/photos/audrey-fun.jpeg",
  "/assets/photos/audrey-ribellia.jpeg"
];

const fallbackChristian = [
  "/assets/photos/cutter-spartan.jpeg",
  "/assets/photos/cutter-smile.JPG",
  "/assets/photos/cutter-huddle.JPG"
];

export default async function Leadership() {
  let audreyImages = fallbackAudrey;
  let christianImages = fallbackChristian;

  try {
    const audreyData = await client.fetch(`*[_type == "carousel" && name == "Audrey Hyde"][0]`);
    if (audreyData?.images?.length > 0) {
      audreyImages = audreyData.images.map((img: any) => urlFor(img).url());
    }

    const christianData = await client.fetch(`*[_type == "carousel" && name == "Christian Cutter"][0]`);
    if (christianData?.images?.length > 0) {
      christianImages = christianData.images.map((img: any) => urlFor(img).url());
    }
  } catch (error) {
    console.error("Failed to fetch Leadership carousels from Sanity:", error);
  }

  return (
    <section id="coaches" className="section leadership">
      <div className="container">
        <div className="leadership-header text-center mb-12">
          <h2 className="section-title centered text-light">Leadership Philosophy</h2>
          <p className="lead-text centered text-light-muted">
            Meet the visionaries guiding the next generation of Wenatchee Valley swimmers.
          </p>
        </div>

        {/* C.A.R.E. Charter Section */}
        <div className="care-section glass-panel dark-glass">
          <div className="care-intro">
            <h3>Our C.A.R.E. Charter</h3>
            <p>
              We are committed to building a competitive, supportive, and disciplined environment.
              Success isn't just measured by the stopwatch, but by character, teamwork, and dedication.
            </p>
          </div>
          <div className="care-grid">
            <div className="care-item">
              <div className="care-letter">C</div>
              <div className="care-content">
                <h4>Control</h4>
                <p>Mastering focus and managing emotions with composure, in and out of the water.</p>
              </div>
            </div>
            <div className="care-item">
              <div className="care-letter">A</div>
              <div className="care-content">
                <h4>Accountability</h4>
                <p>Owning our performance, communicating honestly, and learning from every mistake.</p>
              </div>
            </div>
            <div className="care-item">
              <div className="care-letter">R</div>
              <div className="care-content">
                <h4>Respect</h4>
                <p>Treating coaches, teammates, competitors, and facilities with utmost integrity.</p>
              </div>
            </div>
            <div className="care-item">
              <div className="care-letter">E</div>
              <div className="care-content">
                <h4>Effort</h4>
                <p>Pushing past limits, staying committed to goals, and embracing discipline.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="coaches-grid">
          <div className="coach-card glass-panel dark-glass">

            <div className="coach-carousel-wrapper">
              <Carousel images={audreyImages} altPrefix="Coach Audrey" className="coach-carousel" />
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

            <div className="coach-carousel-wrapper">
              <Carousel images={christianImages} altPrefix="Coach Christian" className="coach-carousel" />
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
