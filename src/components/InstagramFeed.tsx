"use client";

import Script from "next/script";
import styles from "./InstagramFeed.module.css";
import { scopedClasses } from "@/lib/styles";

const POST_URLS = [
  "https://www.instagram.com/p/DboPboND0BE/?utm_source=ig_embed&utm_campaign=loading",
  "https://www.instagram.com/p/DYcvhv7iSrR/?utm_source=ig_embed&utm_campaign=loading",
  "https://www.instagram.com/p/DZFkn-eB6V7/?utm_source=ig_embed&utm_campaign=loading",
];

export default function InstagramFeed() {

  return (
    <section id="social" className={scopedClasses(styles, 'section insta-feed-section')}>
      <Script
        id="instagram-embed-script"
        src="https://www.instagram.com/embed.js"
        onReady={() => {
          (window as Window & { instgrm?: { Embeds?: { process(): void } } })
            .instgrm?.Embeds?.process();
        }}
      />
      <div className={scopedClasses(styles, 'container')}>
        <div className={scopedClasses(styles, 'text-center mb-12')}>
          <span className={scopedClasses(styles, 'section-badge')}>Social Highlights</span>
          <h2 className={scopedClasses(styles, 'section-title centered')}>Follow Our Journey</h2>
          <p className={scopedClasses(styles, 'lead-text centered')}>
            Stay up to date with the latest from Velocity Swimming on Instagram{" "}
            <a
              href="https://www.instagram.com/velocity.swim"
              target="_blank"
              rel="noopener noreferrer"
              className={scopedClasses(styles, 'insta-handle-link')}
            >
              @velocity.swim
            </a>
          </p>
        </div>

        <p className={styles['embed-note']}>If a preview is unavailable, open the post directly on Instagram.</p>
        <div className={scopedClasses(styles, 'insta-embeds-grid')}>
          {POST_URLS.map((url, index) => (
            <div key={index} className={scopedClasses(styles, 'insta-embed-card')}>
              <blockquote
                className="instagram-media"
                data-instgrm-captioned
                data-instgrm-permalink={url}
                data-instgrm-version="14"
                style={{
                  background: "#FFF",
                  border: 0,
                  borderRadius: "12px",
                  boxShadow: "0 0 1px 0 rgba(0,0,0,0.5), 0 1px 10px 0 rgba(0,0,0,0.15)",
                  margin: "1px auto",
                  maxWidth: "540px",
                  minWidth: "280px",
                  padding: 0,
                  width: "100%",
                }}
              >
                <div style={{ padding: "16px" }}>
                  <a
                    href={url}
                    style={{
                      background: "#FFFFFF",
                      lineHeight: 0,
                      padding: "0 0",
                      textAlign: "center",
                      textDecoration: "none",
                      width: "100%",
                      display: "block",
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                      <div
                        style={{
                          backgroundColor: "#F4F4F4",
                          borderRadius: "50%",
                          flexGrow: 0,
                          height: "40px",
                          marginRight: "14px",
                          width: "40px",
                        }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
                        <div
                          style={{
                            backgroundColor: "#F4F4F4",
                            borderRadius: "4px",
                            flexGrow: 0,
                            height: "14px",
                            marginBottom: "6px",
                            width: "100px",
                          }}
                        />
                        <div
                          style={{
                            backgroundColor: "#F4F4F4",
                            borderRadius: "4px",
                            flexGrow: 0,
                            height: "14px",
                            width: "60px",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ padding: "19% 0" }} />
                    <div style={{ color: "#3897f0", fontFamily: "Arial,sans-serif", fontSize: "14px", fontWeight: 600 }}>
                      View this post on Instagram
                    </div>
                  </a>
                </div>
              </blockquote>
              <a href={url} target="_blank" rel="noopener noreferrer" className={styles['post-link']}>
                Open post {index + 1} on Instagram ↗
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
