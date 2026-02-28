require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

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

// Track connected users: { socketId -> { username, room } }
const users = {};
// Store messages per room
const messages = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join', ({ username, room }) => {
    socket.join(room);
    users[socket.id] = { username, room };

    if (!messages[room]) messages[room] = [];

    // Send chat history
    socket.emit('history', messages[room]);

    // Notify others
    io.to(room).emit('system', { msg: `${username} joined the room` });
    updateRoomUsers(room);
  });

  // Chat message
  socket.on('message', ({ text }) => {
    const user = users[socket.id];
    if (!user) return;

    const msg = {
      id: Date.now(),
      username: user.username,
      text,
      time: new Date().toLocaleTimeString()
    };

    messages[user.room].push(msg);
    // Keep last 100 messages
    if (messages[user.room].length > 100) messages[user.room].shift();

    io.to(user.room).emit('message', msg);
  });

  // WebRTC Signaling
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

  // Disconnect
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

const PORT = process.env.PORT ? process.env.PORT :5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
