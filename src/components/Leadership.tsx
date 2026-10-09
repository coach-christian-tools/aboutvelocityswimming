import { siteMedia } from "@/data/site-content";
import styles from "./Leadership.module.css";
import { scopedClasses } from "@/lib/styles";
import Carousel from "./Carousel";




export default function Leadership() {
  const audreyImages = siteMedia.audrey;
  const christianImages = siteMedia.christian;


  return (
    <section id="coaches" className={scopedClasses(styles, 'section leadership')}>
      <div className={scopedClasses(styles, 'container')}>
        <div className={scopedClasses(styles, 'leadership-header text-center mb-12')}>
          <h2 className={scopedClasses(styles, 'section-title centered text-light')}>Leadership Philosophy</h2>
          <p className={scopedClasses(styles, 'lead-text centered text-light-muted')}>
            Meet the visionaries guiding the next generation of Wenatchee Valley swimmers.
          </p>
        </div>

        {/* C.A.R.E. Charter Section */}
        <div className={scopedClasses(styles, 'care-section glass-panel dark-glass')}>
          <div className={scopedClasses(styles, 'care-intro')}>
            <h3>Our C.A.R.E. Charter</h3>
            <p>
              We are committed to building a competitive, supportive, and disciplined environment.
              Success isn&apos;t just measured by the stopwatch, but by character, teamwork, and dedication.
            </p>
          </div>
          <div className={scopedClasses(styles, 'care-grid')}>
            <div className={scopedClasses(styles, 'care-item')}>
              <div className={scopedClasses(styles, 'care-letter')}>C</div>
              <div className={scopedClasses(styles, 'care-content')}>
                <h4>Control</h4>
                <p>Mastering focus and managing emotions with composure, in and out of the water.</p>
              </div>
            </div>
            <div className={scopedClasses(styles, 'care-item')}>
              <div className={scopedClasses(styles, 'care-letter')}>A</div>
              <div className={scopedClasses(styles, 'care-content')}>
                <h4>Accountability</h4>
                <p>Owning our performance, communicating honestly, and learning from every mistake.</p>
              </div>
            </div>
            <div className={scopedClasses(styles, 'care-item')}>
              <div className={scopedClasses(styles, 'care-letter')}>R</div>
              <div className={scopedClasses(styles, 'care-content')}>
                <h4>Respect</h4>
                <p>Treating coaches, teammates, competitors, and facilities with utmost integrity.</p>
              </div>
            </div>
            <div className={scopedClasses(styles, 'care-item')}>
              <div className={scopedClasses(styles, 'care-letter')}>E</div>
              <div className={scopedClasses(styles, 'care-content')}>
                <h4>Effort</h4>
                <p>Pushing past limits, staying committed to goals, and embracing discipline.</p>
              </div>
            </div>
          </div>
        </div>

        <div className={scopedClasses(styles, 'coaches-grid')}>
          <div className={scopedClasses(styles, 'coach-card glass-panel dark-glass')}>

            <div className={scopedClasses(styles, 'coach-carousel-wrapper')}>
              <Carousel images={audreyImages} altPrefix="Coach Audrey" className={scopedClasses(styles, 'coach-carousel')} />
            </div>

            <div className={scopedClasses(styles, 'coach-info')}>
              <h3 className={scopedClasses(styles, 'coach-name')}>Audrey Hyde</h3>
              <p className={scopedClasses(styles, 'coach-role')}>Co-Head Coach (12 & Under)</p>
            </div>

            <div className={scopedClasses(styles, 'qa-section')}>
              <div className={scopedClasses(styles, 'qa-item')}>
                <h4>What does success look like for developing swimmers?</h4>
                <p>
                  &quot;Success isn&apos;t measured by a stopwatch at this age. It&apos;s measured by their excitement to come to practice, their willingness to try hard things, and the friendships they build in the water.&quot;
                </p>
              </div>
              <div className={scopedClasses(styles, 'qa-item')}>
                <h4>How do we prevent burnout?</h4>
                <p>
                  &quot;By keeping it fun and focusing on long-term athletic development. We prioritize stroke technique and a love for the sport over yardage.&quot;
                </p>
              </div>
            </div>
          </div>

          <div className={scopedClasses(styles, 'coach-card glass-panel dark-glass')}>

            <div className={scopedClasses(styles, 'coach-carousel-wrapper')}>
              <Carousel images={christianImages} altPrefix="Coach Christian" className={scopedClasses(styles, 'coach-carousel')} />
            </div>

            <div className={scopedClasses(styles, 'coach-info')}>
              <h3 className={scopedClasses(styles, 'coach-name')}>Christian Cutter</h3>
              <p className={scopedClasses(styles, 'coach-role')}>Co-Head Coach (13 & Over / Masters)</p>
            </div>

            <div className={scopedClasses(styles, 'qa-section')}>
              <div className={scopedClasses(styles, 'qa-item')}>
                <h4>What is the core philosophy for senior athletes?</h4>
                <p>
                  &quot;Empowerment. We want our senior athletes to take ownership of their goals, understand the &apos;why&apos; behind the sets, and learn to race with confidence and character.&quot;
                </p>
              </div>
              <div className={scopedClasses(styles, 'qa-item')}>
                <h4>How does the team prepare swimmers for life?</h4>
                <p>
                  &quot;Swimming is the ultimate teacher of delayed gratification. The resilience they build staring at that black line translates directly to their academics and future careers.&quot;
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
