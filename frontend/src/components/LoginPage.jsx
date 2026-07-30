import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';


const API_BASE = `http://${window.location.hostname}:3000`;

const LoginPage = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      
      localStorage.setItem('smarthome_token', data.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Back to Home */}
      <button 
        onClick={() => navigate('/')}
        className="back-btn"
      >
        <img src="/icons/icons/Left-White.svg" alt="Back" style={{width: 20, height: 20}} />
        <span>Back to Home</span>
      </button>

      <button
        type="button"
        className="login-theme-toggle"
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

      {/* Login Card */}
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon-wrapper">
            <img src="/icons/icons/companyLogo.png" alt="SmartHome" className="login-brand-icon login-logo-light" />
            <img src="/icons/icons/companyLogo-dark.png" alt="SmartHome" className="login-brand-icon login-logo-dark" />
          </div>
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-subtitle">Enter your credentials to access your home.</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Username or Phone</label>
            <div className="input-wrapper">
              <div className="input-icon">
                <img src="/icons/icons/Profile.svg" alt="User" style={{width: 20, height: 20}} />
              </div>
              <input 
                type="text" 
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="auth-input"
                placeholder="admin or 1234567890"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-wrapper">
              <div className="input-icon">
                <img src="/icons/icons/Profile.svg" alt="Lock" style={{width: 24, height: 24}} />
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="submit-btn"
          >
            {loading ? (
              <img src="/icons/icons/Timer-White.svg" alt="Loading" className="spin-icon" style={{width: 20, height: 20}} />
            ) : (
              <>Sign In <img src="/icons/icons/Right-White.svg" alt="Go" style={{width: 20, height: 20}} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
