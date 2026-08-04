import { client, urlFor } from "../sanity/client";
import "./InstagramFeed.css";
import ImageWithLightbox from "./ImageWithLightbox";

// Re-fetch data at most every 60 seconds (ISR)
export const revalidate = 60;

interface SocialPost {
  _id: string;
  title: string;
  caption: string;
  image: any;
}

export default async function InstagramFeed() {
  // Fetch posts from Sanity
  const posts: SocialPost[] = await client.fetch(`*[_type == "socialPost"] | order(_createdAt desc)`);
  
  // If there are no posts in Sanity yet, we can optionally provide a fallback 
  // or simply hide the section. We'll show the section but empty to encourage adding posts.
  if (!posts || posts.length === 0) {
    return null; // Or show a placeholder
  }

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
            <div key={post._id} className="insta-card glass-panel">
              <div className="insta-img-wrapper">
                <ImageWithLightbox 
                  src={urlFor(post.image).width(600).url()} 
                  alt={post.title} 
                  className="insta-img" 
                />
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
