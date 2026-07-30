"use client";

import posts from "../data/instagram-posts.json";
import "./InstagramFeed.css";
import ImageWithLightbox from "./ImageWithLightbox";

export default function InstagramFeed() {
  return (
    <section className="section insta-feed-section">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="section-title centered">Follow Our Journey</h2>
          <p className="lead-text centered">
            Stay up to date with the latest from Velocity Swimming.
          </p>
        </div>
      </div>
      
      <div className="insta-scroll-container">
        <div className="insta-scroll-track">
          {posts.map((post) => (
            <div key={post.id} className="insta-card glass-panel">
              <div className="insta-img-wrapper">
                <ImageWithLightbox src={post.image} alt={post.title} className="insta-img" />
              </div>
              <div className="insta-content">
                <h4 className="insta-title">{post.title}</h4>
                <p className="insta-caption">{post.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
