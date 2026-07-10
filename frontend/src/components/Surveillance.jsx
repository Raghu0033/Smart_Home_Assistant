import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { fetchWithAuth } from '../App';

const API_BASE = `http://${window.location.hostname}:3000`;

const Surveillance = () => {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [layout, setLayout] = useState('grid'); // 'grid' | 'single'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenRef = useRef(null);
  const refreshTimers = useRef({});

  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/cameras`);
      if (res.ok) {
        const data = await res.json();
        setCameras(data);
        setError(null);
      } else {
        setError('Failed to fetch cameras');
      }
    } catch (err) {
      setError('Cannot connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
    // Refresh camera list every 30 seconds
    const interval = setInterval(fetchCameras, 30000);
    return () => clearInterval(interval);
  }, [fetchCameras]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && fullscreenRef.current) {
      fullscreenRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const getStreamUrl = (camera) => {
    return `${API_BASE}${camera.stream_url}?token=${localStorage.getItem('smarthome_token')}&t=${Date.now()}`;
  };

  const getSnapshotUrl = (camera) => {
    return `${API_BASE}${camera.snapshot_url}?token=${localStorage.getItem('smarthome_token')}&t=${Date.now()}`;
  };

  const CameraFeed = ({ camera, isExpanded = false }) => {
    const [streamError, setStreamError] = useState(false);
    const [useStream, setUseStream] = useState(true);
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const retryTimerRef = useRef(null);

    const initHls = useCallback(async () => {
      if (!videoRef.current) return;
      
      try {
        // Fetch the actual HLS playlist URL from our backend
        const hlsRes = await fetchWithAuth(`${API_BASE}${camera.hls_proxy_url}`);
        if (!hlsRes.ok) throw new Error('Failed to get HLS URL');
        const data = await hlsRes.json();
        
        if (!data.hls_url) throw new Error('No HLS URL returned');
        
        const videoSrc = `${API_BASE}${data.hls_url}`;
        
        if (Hls.isSupported()) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
          });
          hlsRef.current = hls;
          
          hls.loadSource(videoSrc);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current.play().catch(e => console.log('Autoplay prevented', e));
          });
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.error('[HLS] Fatal error:', data.type);
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  // Only try to recover once, then fail to trigger "Reconnecting..." overlay
                  if (hls.networkErrorRecovered) {
                    handleStreamError();
                  } else {
                    hls.networkErrorRecovered = true;
                    hls.startLoad();
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  if (hls.mediaErrorRecovered) {
                    handleStreamError();
                  } else {
                    hls.mediaErrorRecovered = true;
                    hls.recoverMediaError();
                  }
                  break;
                default:
                  handleStreamError();
                  break;
              }
            }
          });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS support
          videoRef.current.src = videoSrc;
          videoRef.current.addEventListener('loadedmetadata', () => {
            videoRef.current.play().catch(e => console.log('Autoplay prevented', e));
          });
        }
      } catch (err) {
        console.error('Failed to init HLS for', camera.entity_id, err);
        handleStreamError();
      }
    }, [camera]);

    const handleStreamError = useCallback(() => {
      setStreamError(true);
      setUseStream(false);
      if (hlsRef.current) hlsRef.current.destroy();
      
      // Retry stream after 15 seconds
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        setStreamError(false);
        setUseStream(true);
        initHls();
      }, 15000);
    }, [initHls]);

    useEffect(() => {
      if (useStream) {
        initHls();
      }
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };
    }, [useStream, initHls]);

    const refreshSnapshot = useCallback(() => {
      if (videoRef.current && !useStream && videoRef.current.tagName === 'IMG') {
        videoRef.current.src = getSnapshotUrl(camera);
      }
    }, [camera, useStream]);

    // Auto-refresh snapshots every 5 seconds when not streaming
    useEffect(() => {
      if (!useStream) {
        const interval = setInterval(refreshSnapshot, 5000);
        return () => clearInterval(interval);
      }
    }, [useStream, refreshSnapshot]);

    return (
      <div
        className={`surveillance-feed ${isExpanded ? 'expanded' : ''}`}
        onClick={() => {
          if (!isExpanded) {
            setSelectedCamera(camera);
            setLayout('single');
          }
        }}
      >
        <div className="feed-container">
          {useStream ? (
            <video
              ref={videoRef}
              className="camera-stream"
              autoPlay
              muted
              playsInline
              onError={() => handleStreamError()}
            />
          ) : (
            <img
              ref={videoRef} // Resusing the ref for snapshot mode
              src={getSnapshotUrl(camera)}
              alt={camera.name}
              className="camera-stream"
              onError={() => setStreamError(true)}
            />
          )}

          {streamError && !useStream && (
            <div className="stream-error-overlay">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15.5 10.5l-7 7M8.5 10.5l7 7M3 7.8c0-1.68 0-2.52.327-3.162a3 3 0 011.311-1.311C5.28 3 6.12 3 7.8 3h8.4c1.68 0 2.52 0 3.162.327a3 3 0 011.311 1.311C21 5.28 21 6.12 21 7.8v8.4c0 1.68 0 2.52-.327 3.162a3 3 0 01-1.311 1.311C18.72 21 17.88 21 16.2 21H7.8c-1.68 0-2.52 0-3.162-.327a3 3 0 01-1.311-1.311C3 18.72 3 17.88 3 16.2V7.8z"/>
              </svg>
              <span>Reconnecting...</span>
            </div>
          )}
        </div>

        <div className="feed-overlay">
          <div className="feed-info">
            <span className={`feed-status-dot ${camera.state === 'idle' || camera.state === 'streaming' ? 'live' : ''}`}></span>
            <span className="feed-name">{camera.name}</span>
          </div>
          <div className="feed-badges">
            {camera.state === 'recording' && (
              <span className="recording-badge">
                <span className="rec-dot"></span> REC
              </span>
            )}
            <span className="feed-state-badge">{camera.state}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="surveillance-page">
        <div className="surveillance-loading">
          <div className="loading-spinner-cam"></div>
          <p>Scanning for cameras...</p>
        </div>
      </div>
    );
  }

  if (error && cameras.length === 0) {
    return (
      <div className="surveillance-page">
        <div className="surveillance-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
            <path d="M15.5 10l-5 5M10.5 10l5 5M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/>
          </svg>
          <h3>Unable to connect</h3>
          <p>{error}</p>
          <button className="retry-btn" onClick={() => { setLoading(true); fetchCameras(); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="surveillance-page">
        <div className="surveillance-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
            <path d="M16 10l1.106-.553A1 1 0 0118 10.342v3.316a1 1 0 01-.894.895L16 14M2 8.8c0-1.12 0-1.68.218-2.108a2 2 0 01.874-.874C3.52 5.6 4.08 5.6 5.2 5.6h5.6c1.12 0 1.68 0 2.108.218a2 2 0 01.874.874c.218.428.218.988.218 2.108v6.4c0 1.12 0 1.68-.218 2.108a2 2 0 01-.874.874c-.428.218-.988.218-2.108.218H5.2c-1.12 0-1.68 0-2.108-.218a2 2 0 01-.874-.874C2 16.88 2 16.32 2 15.2V8.8z"/>
          </svg>
          <h3>No cameras found</h3>
          <p>Connect cameras to your Home Assistant to view them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surveillance-page" ref={fullscreenRef}>
      {/* Header */}
      <div className="surveillance-header">
        <div className="surveillance-title-group">
          {layout === 'single' && selectedCamera && (
            <button className="surv-back-btn" onClick={() => { setLayout('grid'); setSelectedCamera(null); }}>
              <img src="/icons/icons/Arrow-White.svg" style={{width: 18, height: 18, transform: 'scaleX(-1)'}} alt="Back" />
            </button>
          )}
          <div>
            <h2>{layout === 'single' && selectedCamera ? selectedCamera.name : 'Surveillance'}</h2>
            <p className="surveillance-subtitle">
              {layout === 'single' && selectedCamera
                ? `${selectedCamera.brand || 'Camera'} ${selectedCamera.model ? '• ' + selectedCamera.model : ''}`
                : `${cameras.length} camera${cameras.length !== 1 ? 's' : ''} connected`
              }
            </p>
          </div>
        </div>

        <div className="surveillance-controls">
          {layout === 'grid' && (
            <div className="layout-toggle-group">
              <button
                className={`layout-btn ${cameras.length <= 4 ? 'active' : ''}`}
                onClick={() => {}}
                title="Grid view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1"/>
                  <rect x="9" y="1" width="6" height="6" rx="1"/>
                  <rect x="1" y="9" width="6" height="6" rx="1"/>
                  <rect x="9" y="9" width="6" height="6" rx="1"/>
                </svg>
              </button>
            </div>
          )}
          <button className="surv-action-btn" onClick={toggleFullscreen} title="Fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFullscreen ? (
                <>
                  <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/>
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/>
                </>
              )}
            </svg>
          </button>
          <button className="surv-action-btn" onClick={() => { setLoading(true); fetchCameras(); }} title="Refresh">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Camera Grid / Single View */}
      {layout === 'single' && selectedCamera ? (
        <div className="surveillance-single-view">
          <CameraFeed camera={selectedCamera} isExpanded={true} />
          {/* Camera info panel */}
          <div className="camera-info-panel glass">
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className={`info-value status-${selectedCamera.state}`}>
                <span className="info-status-dot"></span>
                {selectedCamera.state === 'idle' ? 'Live' : selectedCamera.state}
              </span>
            </div>
            {selectedCamera.brand && (
              <div className="info-row">
                <span className="info-label">Brand</span>
                <span className="info-value">{selectedCamera.brand}</span>
              </div>
            )}
            {selectedCamera.model && (
              <div className="info-row">
                <span className="info-label">Model</span>
                <span className="info-value">{selectedCamera.model}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Entity</span>
              <span className="info-value mono">{selectedCamera.entity_id}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`surveillance-grid cam-count-${Math.min(cameras.length, 9)}`}>
          {cameras.map((camera) => (
            <CameraFeed key={camera.entity_id} camera={camera} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Surveillance;
