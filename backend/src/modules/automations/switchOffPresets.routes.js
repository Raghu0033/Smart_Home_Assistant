import express from 'express';
import SwitchOffPreset from './SwitchOffPreset.js';
import { executeSwitchPreset } from './switchPresetExecutor.js';
import { getPresetDeviceIds, isAutomationDeviceLocked } from './automationDeviceLock.js';

const router = express.Router();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const notifyUser = (req, payload) => {
  const userId = req.user?.id;
  if (userId) req.app.get('io')?.to(`user:${userId}`).emit('automation_notification', payload);
};

const automationFields = body => {
  const executionMode = ['timer', 'schedule'].includes(body.executionMode) ? body.executionMode : 'manual';
  const timerMinutes = Number(body.timerMinutes);
  const timerSeconds = Number(body.timerSeconds || 0);
  const scheduleDays = Array.isArray(body.scheduleDays)
    ? body.scheduleDays.filter(day => DAYS.includes(day))
    : [];
  return {
    name: String(body.name || '').trim(),
    room: String(body.room || '').trim(),
    action: String(body.action || 'off').toLowerCase(),
    executionMode,
    timerMinutes: executionMode === 'timer' ? timerMinutes : undefined,
    timerSeconds: executionMode === 'timer' ? timerSeconds : undefined,
    scheduleTime: executionMode === 'schedule' ? String(body.scheduleTime || '') : undefined,
    scheduleDays: executionMode === 'schedule' ? scheduleDays : [],
    enabled: executionMode === 'timer' ? false : body.enabled !== false,
    nextRunAt: undefined,
    lastRunKey: '',
    targets: Array.isArray(body.targets) ? body.targets : []
  };
};

router.get('/', async (req, res) => {
  try {
    const query = req.query.room ? { room: String(req.query.room) } : {};
    res.json(await SwitchOffPreset.find(query).sort({ createdAt: -1 }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const fields = automationFields(req.body);
    if (fields.executionMode === 'timer' && (!Number.isInteger(fields.timerMinutes) || fields.timerMinutes < 0 || !Number.isInteger(fields.timerSeconds) || fields.timerSeconds < 0 || fields.timerSeconds > 59 || fields.timerMinutes * 60 + fields.timerSeconds < 1)) {
      return res.status(400).json({ message: 'Enter a valid timer duration' });
    }
    if (fields.executionMode === 'schedule' && (!fields.scheduleTime || !fields.scheduleDays.length)) {
      return res.status(400).json({ message: 'Choose a time and at least one day' });
    }
    const preset = await SwitchOffPreset.create({ ...fields, ownerUserId: req.user.id });
    req.app.get('io')?.emit('switch_preset_changed', { action: 'upsert', preset });
    res.status(201).json(preset);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const fields = automationFields(req.body);
    if (fields.executionMode === 'timer' && (!Number.isInteger(fields.timerMinutes) || fields.timerMinutes < 0 || !Number.isInteger(fields.timerSeconds) || fields.timerSeconds < 0 || fields.timerSeconds > 59 || fields.timerMinutes * 60 + fields.timerSeconds < 1)) {
      return res.status(400).json({ message: 'Enter a valid timer duration' });
    }
    if (fields.executionMode === 'schedule' && (!fields.scheduleTime || !fields.scheduleDays.length)) {
      return res.status(400).json({ message: 'Choose a time and at least one day' });
    }
    const preset = await SwitchOffPreset.findByIdAndUpdate(
      req.params.id,
      { ...fields, ownerUserId: req.user.id },
      { new: true, runValidators: true }
    );
    if (!preset) return res.status(404).json({ message: 'Custom off automation not found' });
    req.app.get('io')?.emit('switch_preset_changed', { action: 'upsert', preset });
    res.json(preset);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const preset = await SwitchOffPreset.findById(req.params.id);
    if (!preset) return res.status(404).json({ message: 'Automation not found' });
    const lockedDeviceId = getPresetDeviceIds(preset).find(isAutomationDeviceLocked);
    if (lockedDeviceId) {
      return res.status(423).json({
        message: `Device ${lockedDeviceId} is locked until its timer or schedule automation completes`
      });
    }
    if (preset.executionMode === 'schedule') {
      return res.status(400).json({ message: 'Scheduled automations run only at their configured time' });
    }
    if (preset.executionMode === 'timer') {
      preset.enabled = true;
      const durationSeconds = (Number(preset.timerMinutes || 0) * 60) + Number(preset.timerSeconds || 0);
      preset.nextRunAt = new Date(Date.now() + Math.max(1, durationSeconds) * 1000);
      await preset.save();
      req.app.get('io')?.emit('switch_preset_state', {
        presetId: String(preset._id),
        enabled: true,
        nextRunAt: preset.nextRunAt
      });
      return res.json({
        ok: true,
        armed: true,
        nextRunAt: preset.nextRunAt,
        message: `Timer started for ${preset.timerMinutes || 0} min ${preset.timerSeconds || 0} sec`
      });
    }
    const result = await executeSwitchPreset(preset, req.app.get('io'));
    preset.lastRunAt = new Date();
    await preset.save();
    if (result.aborted) {
      notifyUser(req, {
        id: `switch-automation-error-${preset._id}-${Date.now()}`,
        deviceName: 'No response from the device',
        room: preset.room,
        type: 'automation-error',
        message: `Check WiFi connection. "${preset.name}" stopped at ${result.failedTarget?.label || `Switch ${result.failedTarget?.subDeviceIndex}`} after 2 attempts.`,
        triggeredAt: new Date()
      });
      return res.status(504).json({
        ok: false,
        notificationSent: true,
        message: `No status received from ${result.failedTarget?.label || `Switch ${result.failedTarget?.subDeviceIndex}`} after 2 attempts. Automation stopped.`,
        ...result,
        lastRunAt: preset.lastRunAt
      });
    }
    res.json({ ok: true, ...result, lastRunAt: preset.lastRunAt });
  } catch (error) {
    notifyUser(req, {
      id: `switch-automation-error-${req.params.id}-${Date.now()}`,
      deviceName: 'Automation',
      type: 'automation-error',
      message: `Automation failed: ${error.message}`,
      triggeredAt: new Date()
    });
    res.status(500).json({ message: error.message, notificationSent: true });
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const preset = await SwitchOffPreset.findById(req.params.id);
    if (!preset) return res.status(404).json({ message: 'Automation not found' });
    if (preset.executionMode !== 'timer') {
      return res.status(400).json({ message: 'Only a timer automation can be stopped' });
    }
    preset.enabled = false;
    preset.nextRunAt = undefined;
    await preset.save();
    req.app.get('io')?.emit('switch_preset_state', {
      presetId: String(preset._id),
      enabled: false,
      nextRunAt: null
    });
    res.json({ ok: true, stopped: true, message: `${preset.name} timer stopped` });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const preset = await SwitchOffPreset.findByIdAndDelete(req.params.id);
    if (!preset) return res.status(404).json({ message: 'Custom off preset not found' });
    req.app.get('io')?.emit('switch_preset_changed', {
      action: 'delete',
      presetId: String(preset._id)
    });
    res.json({ message: 'Custom off preset removed' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
