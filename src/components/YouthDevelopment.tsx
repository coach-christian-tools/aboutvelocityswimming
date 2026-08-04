import { client, urlFor } from "../sanity/client";
import "./YouthDevelopment.css";
import Carousel from "./Carousel";

export const revalidate = 60;

const fallbackImages = [
  "/assets/photos/audrey-fun.jpeg",
  "/assets/photos/champs-arms-raised.JPG",
  "/assets/photos/city-pool-camp.JPG",
  "/assets/photos/kids-meet-warm-up.jpeg",
  "/assets/photos/post-parade.jpeg",
  "/assets/photos/pulling-shark.jpeg",
  "/assets/photos/tie-dye-smile.jpeg",
  "/assets/photos/water-splash.jpeg"
];

export default async function YouthDevelopment() {
  let images = fallbackImages;
  
  try {
    const carouselData = await client.fetch(
      `*[_type == "carousel" && name == "Youth Development"][0]`
    );
    
    if (carouselData?.images?.length > 0) {
      images = carouselData.images.map((img: any) => urlFor(img).url());
    }
  } catch (error) {
    console.error("Failed to fetch Youth Development carousel from Sanity:", error);
  }

  return (
    <section id="about" className="section youth-dev">
      <div className="container">
        <div className="youth-grid">
          <div className="youth-content">
            <h2 className="section-title">More Than Just Faster Times</h2>
            <p className="lead-text">
              Swimming is a vehicle for holistic youth development. We believe in building character alongside building athletes.
            </p>
            
            <div className="feature-list">
              <div className="feature-item glass-panel">
                <div className="feature-icon">🧠</div>
                <div className="feature-text">
                  <h3>Cognitive & Academic Growth</h3>
                  <p>Research from Griffith University shows that young swimmers consistently hit cognitive, language, and physical milestones earlier than their non-swimming peers.</p>
                </div>
              </div>
              
              <div className="feature-item glass-panel">
                <div className="feature-icon">❤️</div>
                <div className="feature-text">
                  <h3>Mental & Emotional Health</h3>
                  <p>Individual goal-setting combined with team camaraderie reduces anxiety, builds lifelong resilience, and teaches the valuable lesson of delayed gratification.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="youth-images">
            <Carousel images={images} altPrefix="Velocity Youth Development" />
          </div>
        </div>
      </div>
    </section>
  );
}
