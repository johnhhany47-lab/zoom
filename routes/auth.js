const express = require('express');
const router = express.Router();

// Simple in-memory user store (replace with DB for production)
const users = {};

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (users[username])
    return res.status(400).json({ error: 'Username already taken' });

  users[username] = password; // In production, hash the password!
  res.json({ success: true, username });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] !== password)
    return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ success: true, username });
});

module.exports = router;
