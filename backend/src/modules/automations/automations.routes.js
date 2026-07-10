import express from 'express';
import Automation from './Automation.js';
import { getSensorData, resetRuleState } from './automationEngine.js';

const router = express.Router();

/**
 * GET /api/automations
 * Fetch all automation rules.
 */
router.get('/', async (req, res) => {
  try {
    const automations = await Automation.find().sort({ createdAt: -1 });
    res.json(automations);
  } catch (err) {
    console.error('[API] Error fetching automations:', err);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

/**
 * POST /api/automations
 * Create a new automation rule.
 */
router.post('/', async (req, res) => {
  try {
    const automation = new Automation(req.body);
    await automation.save();
    console.log(`[API] Created automation: "${automation.name}"`);
    res.status(201).json(automation);
  } catch (err) {
    console.error('[API] Error creating automation:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/automations/:id
 * Update an existing automation rule.
 */
router.put('/:id', async (req, res) => {
  try {
    const automation = await Automation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    resetRuleState(automation._id);
    console.log(`[API] Updated automation: "${automation.name}"`);
    res.json(automation);
  } catch (err) {
    console.error('[API] Error updating automation:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/automations/:id/toggle
 * Toggle the enabled state of an automation.
 */
router.patch('/:id/toggle', async (req, res) => {
  try {
    const automation = await Automation.findById(req.params.id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    automation.enabled = !automation.enabled;
    await automation.save();
    console.log(`[API] Toggled automation "${automation.name}" → ${automation.enabled ? 'ON' : 'OFF'}`);
    res.json(automation);
  } catch (err) {
    console.error('[API] Error toggling automation:', err);
    res.status(500).json({ error: 'Failed to toggle automation' });
  }
});

/**
 * DELETE /api/automations/:id
 * Delete an automation rule.
 */
router.delete('/:id', async (req, res) => {
  try {
    const automation = await Automation.findByIdAndDelete(req.params.id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }
    console.log(`[API] Deleted automation: "${automation.name}"`);
    res.json({ message: 'Automation deleted', id: req.params.id });
  } catch (err) {
    console.error('[API] Error deleting automation:', err);
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

/**
 * GET /api/automations/sensors
 * Get current sensor data (for live preview in the UI).
 */
router.get('/sensors', async (req, res) => {
  try {
    res.json(getSensorData());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

export default router;
