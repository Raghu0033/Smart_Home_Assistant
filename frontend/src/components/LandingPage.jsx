import React from 'react';
import { useNavigate } from 'react-router-dom';


const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="auth-page landing-splash-page">
      <main className="landing-main splash-main">
        <div className="landing-splash-bg" aria-hidden="true"></div>
        <div className="landing-splash-overlay" aria-hidden="true"></div>

        <section className="landing-splash-shell">
          <div className="splash-content">
            <p className="splash-kicker">Welcome to</p>

            <div className="splash-brand-block">
              <div className="splash-brand-icon-wrap">
                <img src="/icons/icons/companyLogo-dark.png" alt="Bharat Smart Home" className="splash-brand-icon" />
              </div>
              <div className="splash-brand-text">
                <h1>BHARAT</h1>
                <h2>SMART HOME</h2>
              </div>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="hero-btn splash-login-btn"
            >
              Get Started
            </button>

            <div className="splash-copy-block">
              <p className="splash-copy">
                Step into a smarter home experience built for comfort, control, and elegant everyday automation.
              </p>
              <p className="splash-copy secondary">
                Manage rooms, monitor sensors, and trigger scenes instantly from one beautifully connected dashboard.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;

