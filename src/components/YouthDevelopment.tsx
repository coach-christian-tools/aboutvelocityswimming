import styles from "./YouthDevelopment.module.css";
import { scopedClasses } from "@/lib/styles";
import Carousel from "./Carousel";


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

export default function YouthDevelopment() {
  const images = fallbackImages;
  

  return (
    <section id="about" className={scopedClasses(styles, 'section youth-dev')}>
      <div className={scopedClasses(styles, 'container')}>
        <div className={scopedClasses(styles, 'youth-grid')}>
          <div className={scopedClasses(styles, 'youth-content')}>
            <h2 className={scopedClasses(styles, 'section-title')}>More Than Just Faster Times</h2>
            <p className={scopedClasses(styles, 'lead-text')}>
              Swimming is a vehicle for holistic youth development. We believe in building character alongside building athletes.
            </p>
            
            <div className={scopedClasses(styles, 'feature-list')}>
              <div className={scopedClasses(styles, 'feature-item glass-panel')}>
                <div className={scopedClasses(styles, 'feature-icon')}>🧠</div>
                <div className={scopedClasses(styles, 'feature-text')}>
                  <h3>Cognitive & Academic Growth</h3>
                  <p>Research from Griffith University shows that young swimmers consistently hit cognitive, language, and physical milestones earlier than their non-swimming peers.</p>
                </div>
              </div>
              
              <div className={scopedClasses(styles, 'feature-item glass-panel')}>
                <div className={scopedClasses(styles, 'feature-icon')}>❤️</div>
                <div className={scopedClasses(styles, 'feature-text')}>
                  <h3>Mental & Emotional Health</h3>
                  <p>Individual goal-setting combined with team camaraderie reduces anxiety, builds lifelong resilience, and teaches the valuable lesson of delayed gratification.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className={scopedClasses(styles, 'youth-images')}>
            <Carousel images={images} altPrefix="Velocity Youth Development" />
          </div>
        </div>
      </div>
    </section>
  );
}
