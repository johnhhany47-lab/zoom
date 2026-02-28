const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, password]
    );
    res.json({ success: true, username });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND password = $2',
    [username, password]
  );
  if (result.rows.length === 0)
    return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ success: true, username });
});

module.exports = router;
