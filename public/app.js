const socket = io();

// DOM elements
const loginOverlay = document.getElementById('login-overlay');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const appEl = document.getElementById('app');
const videoUrlInput = document.getElementById('video-url');
const loadBtn = document.getElementById('load-btn');
const playerPlaceholder = document.getElementById('player-placeholder');
const playerContainer = document.getElementById('player-container');
const usersList = document.getElementById('users-list');
const onlineCount = document.getElementById('online-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

let player = null;
let myName = '';
let ignoreEvents = false; // prevents echo loops

// ---- LOGIN ----
function doJoin() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  myName = name;
  socket.emit('join', myName);
  loginOverlay.classList.add('hidden');
  appEl.classList.remove('hidden');
}
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// ---- YOUTUBE PLAYER ----
// Load IFrame API
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
  console.log('YouTube IFrame API ready');
};

function extractVideoId(url) {
  try {
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
  } catch (e) {}
  return null;
}

function loadVideo(videoId, startTime, autoplay) {
  playerPlaceholder.classList.add('hidden');
  playerContainer.classList.remove('hidden');

  if (player) {
    player.destroy();
  }

  player = new YT.Player('yt-player', {
    videoId: videoId,
    playerVars: {
      autoplay: autoplay ? 1 : 0,
      start: Math.floor(startTime || 0),
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: (event) => {
        if (autoplay) event.target.playVideo();
        if (startTime > 0) event.target.seekTo(startTime, true);
      },
      onStateChange: onPlayerStateChange
    }
  });
}

function onPlayerStateChange(event) {
  if (ignoreEvents) return;
  const time = player.getCurrentTime();

  switch (event.data) {
    case YT.PlayerState.PLAYING:
      socket.emit('play', time);
      break;
    case YT.PlayerState.PAUSED:
      socket.emit('pause', time);
      break;
  }
}

// ---- LOAD VIDEO BUTTON ----
loadBtn.addEventListener('click', () => {
  const url = videoUrlInput.value.trim();
  const videoId = extractVideoId(url);
  if (!videoId) return alert('Невірне посилання на YouTube!');
  loadVideo(videoId, 0, true);
  socket.emit('load-video', videoId);
});
videoUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadBtn.click(); });

// ---- SYNC FROM SERVER ----
socket.on('sync', (data) => {
  ignoreEvents = true;

  if (!player || !player.getVideoUrl || !player.getVideoUrl().includes(data.videoId)) {
    loadVideo(data.videoId, data.time, data.playing);
  } else {
    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - data.time) > 2) {
      player.seekTo(data.time, true);
    }
    if (data.playing) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }

  setTimeout(() => { ignoreEvents = false; }, 500);
});

// ---- USERS ----
socket.on('users', (list) => {
  onlineCount.textContent = list.length;
  usersList.innerHTML = list.map(u =>
    `<span class="user-badge">👤 ${escapeHtml(u)}</span>`
  ).join('');
});

// ---- CHAT ----
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat', text);
  chatInput.value = '';
  chatInput.focus();
}
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

socket.on('chat', (msg) => {
  const div = document.createElement('div');
  const isSystem = msg.sender.includes('Система');

  if (isSystem) {
    div.className = 'chat-msg system';
    div.textContent = msg.text;
  } else {
    div.className = 'chat-msg';
    div.innerHTML = `
      <div class="msg-sender">${escapeHtml(msg.sender)}</div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ---- HELPERS ----
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
