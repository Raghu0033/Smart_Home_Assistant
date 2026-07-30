import jwt from 'jsonwebtoken';
import User from '../../modules/users/User.js';
import ChangeRequest from '../../modules/users/ChangeRequest.js';

const authMiddleware = (req, res, next) => {
  // Get token from header
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // Check if not token
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
    const decoded = jwt.verify(token, secret);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

export const requireAdultApproval = resource => async (req, res, next) => {
  if (req.method === 'GET') return next();
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Profile not found' });
    if (user.role === 'admin' || user.accountType === 'adult') return next();

    const approvalCriteria = {
      requestedBy: user._id,
      resource,
      method: req.method,
      path: req.originalUrl,
      body: req.body,
      status: 'approved'
    };
    const approvalId = req.header('X-Approval-Request');
    if (approvalId) approvalCriteria._id = approvalId;
    const approval = await ChangeRequest.findOne(approvalCriteria).sort({ reviewedAt: -1 });
    if (approval) {
      approval.status = 'executed';
      await approval.save();
      return next();
    }

    const request = await ChangeRequest.create({
      requestedBy: user._id,
      resource,
      method: req.method,
      path: req.originalUrl,
      body: req.body
    });
    return res.status(202).json({
      approvalRequired: true,
      requestId: request.id,
      message: 'An adult must approve this change before it can be completed'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export default authMiddleware;

export const requirePermission = permission => async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Profile not found' });
    if (permission === 'dashboard') return next();
    if (user.role === 'admin' || user.permissions.includes(permission)) return next();
    res.status(403).json({ message: `This profile cannot access ${permission}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
