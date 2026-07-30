"use client";

import { useState, useEffect } from "react";
import "./YouthDevelopment.css";
import ImageWithLightbox from "./ImageWithLightbox";

const carouselImages = [
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
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % carouselImages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % carouselImages.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + carouselImages.length) % carouselImages.length);

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
            <div className="carousel-container">
              <ImageWithLightbox 
                src={carouselImages[currentIndex]} 
                alt={`Velocity Youth Development ${currentIndex + 1}`} 
                className="carousel-img" 
              />
              
              <div className="carousel-controls">
                <button onClick={prevSlide} className="carousel-btn">&larr;</button>
                <div className="carousel-dots">
                  {carouselImages.map((_, idx) => (
                    <button 
                      key={idx} 
                      className={`carousel-dot ${idx === currentIndex ? 'active' : ''}`}
                      onClick={() => setCurrentIndex(idx)}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <button onClick={nextSlide} className="carousel-btn">&rarr;</button>
              </div>
              <div className="accent-blob"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
