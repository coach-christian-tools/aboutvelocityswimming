import "./Hero.css";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <img src="/assets/photos/practice.jpg" alt="Velocity Swimming Practice" className="hero-img" />
        <div className="hero-overlay"></div>
      </div>
      
      <div className="hero-content container animate-fade-in">
        <h1 className="hero-title">
          Building <i><u className="accent-underline">Character</u></i> and <i><u className="accent-underline">Athletes</u></i> in the Wenatchee Valley
        </h1>
        <p className="hero-subtitle">
          Fostering excellence, resilience, and community from learn-to-swim to masters.
        </p>
        
        <div className="hero-ctas">
          <a href="#sponsors" className="btn btn-secondary glass-btn">Partner With Us</a>
          <a href="https://www.gomotionapp.com/team/ievs/page/online-registration1" target="_blank" rel="noopener noreferrer" className="btn btn-primary">Join the Team</a>
        </div>
      </div>
    </section>
  );
}
