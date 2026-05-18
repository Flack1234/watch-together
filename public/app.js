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

// ---- NOTIFICATION SOUND ----
const msgSound = new Audio('data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAAAAAP//AAAAAP//AAD//wAAAAD//wAAAAAAAQABAAEAAQACAAIAAwADAAQABQAGAAcACQAKAAwADgARABMAFgAZABwAIAAkACgALAAxADYAOwBBAEcATQBTAFoAYQBoAG8AdgB+AIUAjACUAJsAowCqALIAuQDBAMgAzwDWAN0A4wDpAPAA9QD7AAABBQEKAQ4BEgEWARkBHAEeASABIQEiASIBIgEhASABHgEcARkBFgESAQ4BCgEFAQAB+wD1APAA6QDjAN0A1gDPAMgAwQC6ALIAqwCjAJsAlACMAIUAfgB2AG8AaABhAFoAUwBNAEcAQQA7ADYAMQAsACgAJAAgABwAGQAWABMAEQAOAAwACgAJAAcABgAFAAQAAwACAAIAAQABAAAAAAAA//8AAP//AAAAAP//AAD//wAAAAAAAAAAAAD//wAA//8AAP//AAD//wAA/v8AAP7/AAD+/wAA/v8AAP7/AAD9/wAA/f8AAP3/AAD8/wAA/P8AAPv/AAD7/wAA+v8AAPr/AAD5/wAA+P8AAPj/AAD3/wAA9v8AAPX/AAD0/wAA9P8AAPP/AADy/wAA8f8AAPD/AADv/wAA7v8AAO3/AADs/wAA6/8AAOr/AADp/wAA6P8AAOf/AADm/wAA5f8AAOT/AADj/wAA4v8AAOH/AADh/wAA4P8AAN//AADe/wAA3v8AAN3/AADd/wAA3P8AANz/AADb/wAA2/8AANv/AADb/wAA2v8AANr/AADa/wAA2v8AANr/AADa/wAA2v8AANv/AADb/wAA2/8AANv/AADc/wAA3P8AAN3/AADd/wAA3v8AAN7/AADf/wAA4P8AAOH/AADh/wAA4v8AAOP/AADk/wAA5f8AAOb/AADn/wAA6P8AAOn/AADq/wAA6/8AAOz/AADt/wAA7v8AAO//AADw/wAA8f8AAPL/AADz/wAA9P8AAPX/AAD1/wAA9v8AAPf/AAD4/wAA+P8AAPn/AAD6/wAA+v8AAPv/AAD7/wAA/P8AAPz/AAD9/wAA/f8AAP3/AAD+/wAA/v8AAP7/AAD+/wAA//8AAP//AAD//wAA//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
let soundEnabled = true;

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

function isImageUrl(text) {
  const t = text.trim();
  return /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(t)
    || /^https?:\/\/media\.tenor\.com\//i.test(t)
    || /^https?:\/\/i\.giphy\.com\//i.test(t);
}

function renderMessageContent(text) {
  if (isImageUrl(text)) {
    return `<img class="msg-image" src="${escapeHtml(text)}" loading="lazy" onclick="showFullImage('${escapeHtml(text)}')" />`;
  }
  return `<div class="msg-text">${escapeHtml(text)}</div>`;
}

function showFullImage(url) {
  const overlay = document.createElement('div');
  overlay.id = 'image-overlay';
  overlay.innerHTML = `<img src="${url}" />`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
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
      ${renderMessageContent(msg.text)}
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

    // Play sound for messages from others
    if (msg.sender !== myName && soundEnabled) {
      msgSound.currentTime = 0;
      msgSound.play().catch(() => {});
    }
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

// ---- GIF SEARCH ----
const gifBtn = document.getElementById('gif-btn');
const gifPanel = document.getElementById('gif-panel');
const gifSearch = document.getElementById('gif-search');
const gifResults = document.getElementById('gif-results');
const TENOR_KEY = 'AIzaSyBqkFMqfpif69GJvsuk-YMfNhJsTnACPIo';
let gifDebounce = null;

gifBtn.addEventListener('click', () => {
  gifPanel.classList.toggle('hidden');
  if (!gifPanel.classList.contains('hidden')) {
    gifSearch.focus();
    searchGifs('funny');
  }
});

gifSearch.addEventListener('input', () => {
  clearTimeout(gifDebounce);
  gifDebounce = setTimeout(() => {
    const q = gifSearch.value.trim();
    if (q.length > 1) searchGifs(q);
  }, 400);
});

async function searchGifs(query) {
  try {
    const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=12&media_filter=tinygif`);
    const data = await res.json();
    gifResults.innerHTML = '';
    if (data.results) {
      data.results.forEach(gif => {
        const url = gif.media_formats.tinygif.url;
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.addEventListener('click', () => {
          socket.emit('chat', { text: url });
          gifPanel.classList.add('hidden');
          gifSearch.value = '';
        });
        gifResults.appendChild(img);
      });
    }
  } catch (e) {
    console.error('GIF search error:', e);
  }
}

// ---- HELPERS ----
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
