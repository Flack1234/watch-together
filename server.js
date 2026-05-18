const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = new Map();
let currentVideo = { videoId: '', time: 0, playing: false, lastUpdate: Date.now() };

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('join', (name) => {
    users.set(socket.id, name);
    io.emit('users', Array.from(users.values()));
    io.emit('chat', { sender: '⚡ Система', text: `${name} приєднався(-лась)` });
    // Send current video state to the new user
    if (currentVideo.videoId) {
      const elapsed = currentVideo.playing
        ? (Date.now() - currentVideo.lastUpdate) / 1000
        : 0;
      socket.emit('sync', {
        videoId: currentVideo.videoId,
        time: currentVideo.time + elapsed,
        playing: currentVideo.playing
      });
    }
  });

  socket.on('chat', (text) => {
    const name = users.get(socket.id) || 'Анонім';
    io.emit('chat', { sender: name, text });
  });

  socket.on('load-video', (videoId) => {
    currentVideo = { videoId, time: 0, playing: true, lastUpdate: Date.now() };
    socket.broadcast.emit('sync', { videoId, time: 0, playing: true });
  });

  socket.on('play', (time) => {
    currentVideo = { ...currentVideo, time, playing: true, lastUpdate: Date.now() };
    socket.broadcast.emit('sync', { videoId: currentVideo.videoId, time, playing: true });
  });

  socket.on('pause', (time) => {
    currentVideo = { ...currentVideo, time, playing: false, lastUpdate: Date.now() };
    socket.broadcast.emit('sync', { videoId: currentVideo.videoId, time, playing: false });
  });

  socket.on('seek', (time) => {
    currentVideo = { ...currentVideo, time, lastUpdate: Date.now() };
    socket.broadcast.emit('sync', { videoId: currentVideo.videoId, time, playing: currentVideo.playing });
  });

  // ---- VOICE CHAT (WebRTC signaling) ----
  socket.on('voice-join', () => {
    socket.join('voice-room');
    // Notify others in voice room that a new user joined
    socket.to('voice-room').emit('voice-user-joined', socket.id);
    // Send list of current voice users to the new user
    const voiceRoom = io.sockets.adapter.rooms.get('voice-room');
    if (voiceRoom) {
      const voiceUsers = Array.from(voiceRoom).filter(id => id !== socket.id);
      socket.emit('voice-users', voiceUsers);
    }
  });

  socket.on('voice-leave', () => {
    socket.leave('voice-room');
    socket.to('voice-room').emit('voice-user-left', socket.id);
  });

  socket.on('voice-signal', ({ to, signal }) => {
    io.to(to).emit('voice-signal', { from: socket.id, signal });
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);
    io.emit('users', Array.from(users.values()));
    // Notify voice room
    socket.to('voice-room').emit('voice-user-left', socket.id);
    if (name) {
      io.emit('chat', { sender: '⚡ Система', text: `${name} вийшов(-ла)` });
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('========================================');
  console.log(`  Watch Together запущено!`);
  console.log(`  Локально:   http://localhost:${PORT}`);
  console.log(`  У мережі:  http://${ip}:${PORT}`);
  console.log('========================================');
  console.log('');
  console.log('Надішли посилання http://' + ip + ':' + PORT + ' подрузі!');
});
