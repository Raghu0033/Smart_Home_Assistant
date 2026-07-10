import express from 'express';
import {
  smarthomeFulfillment,
  fakeAuth,
  fakeToken,
} from './smarthome.controller.js';

const router = express.Router();

// Smart Home fulfillment endpoint
router.post('/', smarthomeFulfillment);

// Fake OAuth endpoints for Actions linking
router.get('/fakeauth', fakeAuth);
router.post('/faketoken', fakeToken);

export default router;
