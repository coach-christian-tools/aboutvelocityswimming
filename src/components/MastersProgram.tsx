import { siteMedia } from "@/data/site-content";
import styles from "./MastersProgram.module.css";
import { scopedClasses } from "@/lib/styles";
import ImageWithLightbox from "./ImageWithLightbox";


export default function MastersProgram() {
  const mastersProgramImageSrc = siteMedia.masters;


  return (
    <section id="masters" className={scopedClasses(styles, 'section masters-program')}>
      <div className={scopedClasses(styles, 'container')}>
        <div className={scopedClasses(styles, 'masters-grid')}>
          <div className={scopedClasses(styles, 'masters-image-wrapper')}>
            <ImageWithLightbox src={mastersProgramImageSrc} alt="Masters swimming camaraderie" className={scopedClasses(styles, 'masters-img')} />
            <div className={scopedClasses(styles, 'accent-square')}></div>
          </div>
          
          <div className={scopedClasses(styles, 'masters-content')}>
            <h2 className={scopedClasses(styles, 'section-title')}>Lifelong Fitness & Camaraderie</h2>
            <p className={scopedClasses(styles, 'lead-text')}>
              Swimming is a lifelong pursuit, offering incredible physical and mental benefits at any age. Our Masters program is built for adults who want to stay active, socialize, or train for unique endurance challenges.
            </p>
            
            <ul className={scopedClasses(styles, 'benefits-list')}>
              <li>
                <span className={scopedClasses(styles, 'check-icon')}>✓</span>
                <div>
                  <strong>Cardiovascular Health</strong>
                  <p>A joint-friendly full-body workout that strengthens the heart and lungs.</p>
                </div>
              </li>
              <li>
                <span className={scopedClasses(styles, 'check-icon')}>✓</span>
                <div>
                  <strong>Mental Well-being</strong>
                  <p>Community fitness groups are positively correlated with longevity and reduced stress.</p>
                </div>
              </li>
              <li>
                <span className={scopedClasses(styles, 'check-icon')}>✓</span>
                <div>
                  <strong>For Every Level</strong>
                  <p>From former collegiate athletes staying sharp to beginners looking for a healthy routine.</p>
                </div>
              </li>
            </ul>
            
            <div className={scopedClasses(styles, 'mt-8')}>
              <a href="https://velocity-swimming.com" target="_blank" rel="noopener noreferrer" className={scopedClasses(styles, 'btn btn-primary')}>Join Masters Today</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
