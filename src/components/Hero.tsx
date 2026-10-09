import { siteMedia } from "@/data/site-content";
import styles from "./Hero.module.css";
import { scopedClasses } from "@/lib/styles";
import Link from "next/link";


export default function Hero() {
  const heroImageSrc = siteMedia.hero;


  return (
    <section id="overview" className={scopedClasses(styles, 'hero')}>
      <div className={scopedClasses(styles, 'hero-background')}>
        <img src={heroImageSrc} alt="Velocity Swimming Practice" className={scopedClasses(styles, 'hero-img')} />
        <div className={scopedClasses(styles, 'hero-overlay')}></div>
      </div>
      
      <div className={scopedClasses(styles, 'hero-content container animate-fade-in')}>
        <h1 className={scopedClasses(styles, 'hero-title')}>
          Building <i><u className={scopedClasses(styles, 'accent-underline')}>Character</u></i> and <i><u className={scopedClasses(styles, 'accent-underline')}>Athletes</u></i> in the Wenatchee Valley
        </h1>
        <p className={scopedClasses(styles, 'hero-subtitle')}>
          Fostering excellence, resilience, and community from learn-to-swim to masters.
        </p>
        
        <div className={scopedClasses(styles, 'hero-ctas')}>
          <Link href="/sponsors" className={scopedClasses(styles, 'btn btn-secondary glass-btn')}>Partner With Us</Link>
          <a href="https://www.gomotionapp.com/team/ievs/page/online-registration1" target="_blank" rel="noopener noreferrer" className={scopedClasses(styles, 'btn btn-primary')}>Join the Team</a>
        </div>
      </div>
    </section>
  );
}
