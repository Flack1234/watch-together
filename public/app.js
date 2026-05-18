const socket = io();

const SITE_PASSWORD = '4422';

// DOM elements
const passwordOverlay = document.getElementById('password-overlay');
const passwordInput = document.getElementById('password-input');
const passwordBtn = document.getElementById('password-btn');
const passwordError = document.getElementById('password-error');
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

// ---- PASSWORD ----
function checkPassword() {
  const pwd = passwordInput.value.trim();
  if (pwd === SITE_PASSWORD) {
    passwordOverlay.classList.add('hidden');
    loginOverlay.classList.remove('hidden');
    nameInput.focus();
  } else {
    passwordError.classList.remove('hidden');
    passwordInput.value = '';
    passwordInput.focus();
  }
}
passwordBtn.addEventListener('click', checkPassword);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkPassword(); });

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
let replyingTo = null;

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (replyingTo) {
    socket.emit('chat', { text, replyTo: replyingTo });
    cancelReply();
  } else {
    socket.emit('chat', { text });
  }
  chatInput.value = '';
  chatInput.focus();
}
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function setReply(msgId, sender, text) {
  replyingTo = { id: msgId, sender, text };
  let replyBar = document.getElementById('reply-bar');
  if (!replyBar) {
    replyBar = document.createElement('div');
    replyBar.id = 'reply-bar';
    document.querySelector('.chat-input-row').before(replyBar);
  }
  replyBar.innerHTML = `
    <span class="reply-preview">↩ <b>${escapeHtml(sender)}</b>: ${escapeHtml(text.slice(0, 40))}${text.length > 40 ? '...' : ''}</span>
    <button id="cancel-reply-btn">✕</button>
  `;
  replyBar.classList.remove('hidden');
  document.getElementById('cancel-reply-btn').addEventListener('click', cancelReply);
  chatInput.focus();
}

function cancelReply() {
  replyingTo = null;
  const replyBar = document.getElementById('reply-bar');
  if (replyBar) replyBar.classList.add('hidden');
}

socket.on('chat', (msg) => {
  const div = document.createElement('div');
  const isSystem = msg.sender && msg.sender.includes('Система');

  if (isSystem) {
    div.className = 'chat-msg system';
    div.textContent = msg.text;
  } else {
    div.className = 'chat-msg';
    div.setAttribute('data-msg-id', msg.id);

    let replyHtml = '';
    if (msg.replyTo) {
      replyHtml = `<div class="msg-reply">↩ <b>${escapeHtml(msg.replyTo.sender)}</b>: ${escapeHtml(msg.replyTo.text.slice(0, 30))}</div>`;
    }

    div.innerHTML = `
      ${replyHtml}
      <div class="msg-sender">${escapeHtml(msg.sender)}</div>
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-actions">
        <button class="msg-react-btn" data-msgid="${msg.id}">😊</button>
        <button class="msg-reply-btn" data-msgid="${msg.id}" data-sender="${escapeHtml(msg.sender)}" data-text="${escapeHtml(msg.text)}">↩</button>
        <span class="msg-reactions-list" data-msgid="${msg.id}"></span>
      </div>
    `;

    div.querySelector('.msg-reply-btn').addEventListener('click', (e) => {
      setReply(msg.id, msg.sender, msg.text);
    });

    div.querySelector('.msg-react-btn').addEventListener('click', (e) => {
      showReactPicker(msg.id, e.target);
    });
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ---- MESSAGE REACTIONS ----
const msgReactEmojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

function showReactPicker(msgId, anchor) {
  let picker = document.getElementById('react-picker');
  if (picker) picker.remove();

  picker = document.createElement('div');
  picker.id = 'react-picker';
  picker.innerHTML = msgReactEmojis.map(e =>
    `<button class="picker-emoji" data-emoji="${e}">${e}</button>`
  ).join('');

  const rect = anchor.getBoundingClientRect();
  picker.style.left = rect.left + 'px';
  picker.style.top = (rect.top - 40) + 'px';
  document.body.appendChild(picker);

  picker.querySelectorAll('.picker-emoji').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('msg-reaction', { msgId, emoji: btn.dataset.emoji });
      picker.remove();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function closePicker() {
      if (picker) picker.remove();
      document.removeEventListener('click', closePicker);
    }, { once: true });
  }, 10);
}

socket.on('msg-reaction', ({ msgId, emoji }) => {
  const list = document.querySelector(`.msg-reactions-list[data-msgid="${msgId}"]`);
  if (list) {
    const span = document.createElement('span');
    span.className = 'msg-reaction-emoji';
    span.textContent = emoji;
    list.appendChild(span);
  }
});

// ---- REACTIONS ----
const reactionsCanvas = document.getElementById('reactions-canvas');

document.querySelectorAll('.react-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    socket.emit('reaction', emoji);
    spawnReaction(emoji);
  });
});

socket.on('reaction', (emoji) => {
  spawnReaction(emoji);
});

function spawnReaction(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = (Math.random() * 80 + 10) + '%';
  el.style.bottom = '10%';
  reactionsCanvas.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---- HELPERS ----
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
