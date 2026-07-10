import express from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { cachedHaStates, requestCameraStream } from '../../integrations/homeassistant/ha-client.js';

const router = express.Router();

// Derive HA HTTP base from the WebSocket URL in .env
const getHaHttpBase = () => {
  const wsUrl = process.env.HA_URL || 'ws://homeassistant.local:8123/api/websocket';
  return wsUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://')
    .replace('/api/websocket', '');
};

/**
 * Lightweight auth check that accepts token from query string OR Authorization header.
 * Required because <video src> or <img src> tags cannot set Authorization headers easily.
 */
const streamAuth = (req, res, next) => {
  const token = req.query.token
    || (req.header('Authorization') && req.header('Authorization').split(' ')[1]);

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
    jwt.verify(token, secret);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * GET /api/cameras
 * Returns a list of all camera entities from Home Assistant
 */
router.get('/', streamAuth, (req, res) => {
  try {
    const cameras = [];

    for (const [entityId, entity] of cachedHaStates) {
      if (entityId.startsWith('camera.')) {
        const attrs = entity.attributes || {};
        cameras.push({
          entity_id: entityId,
          name: attrs.friendly_name || entityId.replace('camera.', '').replace(/_/g, ' '),
          state: entity.state, // 'idle', 'streaming', 'recording'
          brand: attrs.brand || '',
          model: attrs.model_id || attrs.model || '',
          frontend_stream_type: attrs.frontend_stream_type || 'hls',
          supports_stream: attrs.supported_features !== undefined,
          hls_proxy_url: `/api/cameras/${encodeURIComponent(entityId)}/hls_url`,
          snapshot_url: `/api/cameras/${encodeURIComponent(entityId)}/snapshot`,
        });
      }
    }

    res.json(cameras);
  } catch (err) {
    console.error('[CAMERAS] Error listing cameras:', err.message);
    res.status(500).json({ error: 'Failed to list cameras' });
  }
});

/**
 * GET /api/cameras/:entityId/snapshot
 * Proxies the camera snapshot image from Home Assistant.
 */
router.get('/:entityId/snapshot', streamAuth, async (req, res) => {
  try {
    const { entityId } = req.params;
    const haBase = getHaHttpBase();
    const token = process.env.HA_TOKEN;

    const haRes = await fetch(`${haBase}/api/camera_proxy/${entityId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!haRes.ok) {
      console.error(`[CAMERAS] HA snapshot error for ${entityId}: ${haRes.status} ${haRes.statusText}`);
      return res.status(haRes.status).json({ error: 'Failed to fetch snapshot from HA' });
    }

    const contentType = haRes.headers.get('content-type') || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    haRes.body.pipe(res);
  } catch (err) {
    console.error('[CAMERAS] Snapshot proxy error:', err.message);
    res.status(500).json({ error: 'Failed to proxy snapshot' });
  }
});

/**
 * GET /api/cameras/:entityId/hls_url
 * Requests an HLS stream from HA and returns the relative path.
 * We will use http-proxy-middleware to intercept /api/hls and forward it to HA.
 */
router.get('/:entityId/hls_url', streamAuth, async (req, res) => {
  try {
    const { entityId } = req.params;
    const hlsUrl = await requestCameraStream(entityId);
    // Returns something like /api/hls/9f21d.../master_playlist.m3u8
    res.json({ hls_url: hlsUrl });
  } catch (err) {
    console.error(`[CAMERAS] Failed to get HLS URL for ${req.params.entityId}:`, err.message);
    res.status(500).json({ error: 'Failed to negotiate stream with HA' });
  }
});

export default router;
