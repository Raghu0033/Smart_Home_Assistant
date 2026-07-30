import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';


const LandingPage = () => {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  return (
    <div className="auth-page landing-splash-page">
      <main className="landing-main splash-main">
        <div className="landing-splash-bg" aria-hidden="true"></div>
        <div className="landing-splash-overlay" aria-hidden="true"></div>
        <button
          type="button"
          className="login-theme-toggle landing-theme-toggle"
          onClick={() => setIsDarkMode(value => !value)}
          aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
        >
          {isDarkMode ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>
          )}
          <span>{isDarkMode ? 'Light' : 'Dark'}</span>
        </button>

        <section className="landing-splash-shell">
          <div className="splash-content">
            <p className="splash-kicker">Welcome to</p>

            <div className="splash-brand-block">
              <div className="splash-brand-icon-wrap">
                <img src="/icons/icons/smart_home_logo.png" alt="Bharat Smart Home" className="splash-brand-icon" />
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
