import { siteMedia } from "@/data/site-content";
import styles from "./VelocityInAction.module.css";
import { scopedClasses } from "@/lib/styles";
import ImageWithLightbox from "./ImageWithLightbox";


export default function VelocityInAction() {
  const athleteSpotlightImageSrc = siteMedia.spotlight;
  const beyondThePoolImageSrc = siteMedia.community;


  return (
    <section id="community" className={scopedClasses(styles, 'section velocity-action')}>
      <div className={scopedClasses(styles, 'container')}>
        <div className={scopedClasses(styles, 'text-center mb-12')}>
          <h2 className={scopedClasses(styles, 'section-title centered')}>Velocity in Action</h2>
          <p className={scopedClasses(styles, 'lead-text centered')}>
            Our athletes don&apos;t just succeed in the pool; they make an impact in our community.
          </p>
        </div>

        <div className={scopedClasses(styles, 'action-grid')}>
          <div className={scopedClasses(styles, 'action-card glass-panel')}>
            <div className={scopedClasses(styles, 'action-img-container')}>
              <ImageWithLightbox src={athleteSpotlightImageSrc} alt="Athlete spotlight" className={scopedClasses(styles, 'action-img action-img-spotlight')} />
            </div>
            <div className={scopedClasses(styles, 'action-content')}>
              <h3>Athlete Spotlights</h3>
              <p>
                Congratulations to Marieka, Sadie, Lindsay, and Aurelia! We are so proud of your dedication and achievements with Velocity Swimming and wish you all the best in your exciting college swimming careers.
              </p>
            </div>
          </div>

          <div className={scopedClasses(styles, 'action-card glass-panel')}>
            <div className={scopedClasses(styles, 'action-img-container')}>
              <ImageWithLightbox src={beyondThePoolImageSrc} alt="Community impact" className={scopedClasses(styles, 'action-img')} />
            </div>
            <div className={scopedClasses(styles, 'action-content')}>
              <h3>Beyond the Pool</h3>
              <p>
                From volunteering at the Serve Wenatchee Valley food drive to completing our 5-mile cancer research endurance swim, our team is dedicated to giving back and developing true citizens.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

  );
}
