import { client, urlFor } from "../sanity/client";
import "./MastersProgram.css";
import ImageWithLightbox from "./ImageWithLightbox";

export const revalidate = 60;

export default async function MastersProgram() {
  let mastersProgramImageSrc = "/assets/photos/masters.jpeg";

  try {
    const data = await client.fetch(`*[_type == "pagePhotos"][0]`);
    if (data?.mastersProgramImage) {
      mastersProgramImageSrc = urlFor(data.mastersProgramImage).url();
    }
  } catch (error) {
    console.error("Failed to fetch MastersProgram image from Sanity:", error);
  }

  return (
    <section id="masters" className="section masters-program">
      <div className="container">
        <div className="masters-grid">
          <div className="masters-image-wrapper">
            <ImageWithLightbox src={mastersProgramImageSrc} alt="Masters swimming camaraderie" className="masters-img" />
            <div className="accent-square"></div>
          </div>
          
          <div className="masters-content">
            <h2 className="section-title">Lifelong Fitness & Camaraderie</h2>
            <p className="lead-text">
              Swimming is a lifelong pursuit, offering incredible physical and mental benefits at any age. Our Masters program is built for adults who want to stay active, socialize, or train for unique endurance challenges.
            </p>
            
            <ul className="benefits-list">
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>Cardiovascular Health</strong>
                  <p>A joint-friendly full-body workout that strengthens the heart and lungs.</p>
                </div>
              </li>
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>Mental Well-being</strong>
                  <p>Community fitness groups are positively correlated with longevity and reduced stress.</p>
                </div>
              </li>
              <li>
                <span className="check-icon">✓</span>
                <div>
                  <strong>For Every Level</strong>
                  <p>From former collegiate athletes staying sharp to beginners looking for a healthy routine.</p>
                </div>
              </li>
            </ul>
            
            <div className="mt-8">
              <a href="https://velocity-swimming.com" target="_blank" rel="noopener noreferrer" className="btn btn-primary">Join Masters Today</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
