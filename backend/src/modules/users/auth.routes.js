import express from 'express';
import jwt from 'jsonwebtoken';
import User from './User.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Please provide username/phone and password' });
    }

    // Check for user by username or phone
    const user = await User.findOne({
      $or: [{ username: identifier }, { phone: identifier }]
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id
      }
    };

    const secret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
    
    jwt.sign(
      payload,
      secret,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: { username: user.username, phone: user.phone } });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).send('Server error');
  }
});

export default router;
