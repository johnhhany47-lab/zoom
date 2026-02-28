try { require('dotenv').config(); } catch(e) {}
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

const users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', async ({ username, room }) => {
    socket.join(room);
    users[socket.id] = { username, room };

    await pool.query(
      'INSERT INTO rooms (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [room]
    );

    const result = await pool.query(
      'SELECT * FROM messages WHERE room = $1 ORDER BY created_at ASC LIMIT 100',
      [room]
    );
    const history = result.rows.map(r => ({
      id: r.id,
      username: r.username,
      text: r.text,
      fileUrl: r.file_url,
      filename: r.filename,
      time: new Date(r.created_at).toLocaleTimeString()
    }));

    socket.emit('history', history);
    io.to(room).emit('system', { msg: `${username} joined the room` });
    updateRoomUsers(room);
  });

  socket.on('message', async ({ text, fileUrl, filename }) => {
    const user = users[socket.id];
    if (!user) return;

    const result = await pool.query(
      'INSERT INTO messages (room, username, text, file_url, filename) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user.room, user.username, text || null, fileUrl || null, filename || null]
    );
    const row = result.rows[0];

    const msg = {
      id: row.id,
      username: row.username,
      text: row.text,
      fileUrl: row.file_url,
      filename: row.filename,
      time: new Date(row.created_at).toLocaleTimeString()
    };

    io.to(user.room).emit('message', msg);
  });

  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice', { from: socket.id, candidate });
  });

  socket.on('call-user', ({ to, callType }) => {
    const caller = users[socket.id];
    io.to(to).emit('incoming-call', {
      from: socket.id,
      username: caller?.username,
      callType
    });
  });

  socket.on('call-accepted', ({ to }) => {
    io.to(to).emit('call-accepted', { from: socket.id });
  });

  socket.on('call-rejected', ({ to }) => {
    io.to(to).emit('call-rejected', { from: socket.id });
  });

  socket.on('call-ended', ({ to }) => {
    io.to(to).emit('call-ended');
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.room).emit('system', { msg: `${user.username} left the room` });
      delete users[socket.id];
      updateRoomUsers(user.room);
    }
  });

  function updateRoomUsers(room) {
    const roomUsers = Object.entries(users)
      .filter(([, u]) => u.room === room)
      .map(([id, u]) => ({ id, username: u.username }));
    io.to(room).emit('room-users', roomUsers);
  }
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
