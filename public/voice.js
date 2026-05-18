// ---- VOICE CHAT (WebRTC) ----
const micBtn = document.getElementById('mic-btn');
const speakerBtn = document.getElementById('speaker-btn');
const videoMuteBtn = document.getElementById('video-mute-btn');
const micVolume = document.getElementById('mic-volume');
const speakerVolume = document.getElementById('speaker-volume');
const videoVolume = document.getElementById('video-volume');
const micVolValue = document.getElementById('mic-vol-value');
const speakerVolValue = document.getElementById('speaker-vol-value');
const videoVolValue = document.getElementById('video-vol-value');

let localStream = null;
let micGainNode = null;
let audioContext = null;
let peers = {};
let micEnabled = false;
let speakerEnabled = true;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ---- MIC TOGGLE ----
micBtn.addEventListener('click', async () => {
  if (!micEnabled) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Create gain node for mic volume control
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(localStream);
      micGainNode = audioContext.createGain();
      micGainNode.gain.value = micVolume.value / 100;
      const dest = audioContext.createMediaStreamDestination();
      source.connect(micGainNode);
      micGainNode.connect(dest);
      // Replace localStream with processed stream
      localStream = dest.stream;

      micEnabled = true;
      micBtn.classList.remove('off');
      micBtn.classList.add('on');
      socket.emit('voice-join');
    } catch (err) {
      alert('Не вдалося отримати доступ до мікрофона. Перевір дозволи браузера.');
      console.error(err);
    }
  } else {
    micEnabled = false;
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    Object.keys(peers).forEach(peerId => {
      peers[peerId].close();
      delete peers[peerId];
    });
    micBtn.classList.remove('on');
    micBtn.classList.add('off');
    socket.emit('voice-leave');
  }
});

// ---- SPEAKER TOGGLE ----
speakerBtn.addEventListener('click', () => {
  speakerEnabled = !speakerEnabled;
  if (speakerEnabled) {
    speakerBtn.classList.remove('off');
    speakerBtn.classList.add('on');
    speakerBtn.textContent = '🔊';
  } else {
    speakerBtn.classList.remove('on');
    speakerBtn.classList.add('off');
    speakerBtn.textContent = '🔇';
  }
  // Mute/unmute all remote audio elements
  document.querySelectorAll('audio[data-peer]').forEach(audio => {
    audio.muted = !speakerEnabled;
  });
});

// ---- VIDEO MUTE TOGGLE ----
videoMuteBtn.addEventListener('click', () => {
  if (!player) return;
  const isMuted = player.isMuted();
  if (isMuted) {
    player.unMute();
    videoMuteBtn.classList.remove('off');
    videoMuteBtn.classList.add('on');
    videoMuteBtn.textContent = '🎬';
  } else {
    player.mute();
    videoMuteBtn.classList.remove('on');
    videoMuteBtn.classList.add('off');
    videoMuteBtn.textContent = '🔇';
  }
});

// ---- VOLUME SLIDERS ----
micVolume.addEventListener('input', () => {
  const val = micVolume.value;
  micVolValue.textContent = val + '%';
  if (micGainNode) {
    micGainNode.gain.value = val / 100;
  }
});

speakerVolume.addEventListener('input', () => {
  const val = speakerVolume.value;
  speakerVolValue.textContent = val + '%';
  document.querySelectorAll('audio[data-peer]').forEach(audio => {
    audio.volume = val / 100;
  });
});

videoVolume.addEventListener('input', () => {
  const val = videoVolume.value;
  videoVolValue.textContent = val + '%';
  if (player && player.setVolume) {
    player.setVolume(val);
  }
});

// --- WebRTC Signaling via Socket.IO ---

socket.on('voice-user-joined', async (peerId) => {
  if (!micEnabled) return;
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('voice-signal', { to: peerId, signal: { type: 'offer', sdp: offer.sdp } });
});

socket.on('voice-user-left', (peerId) => {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
  }
  const audioEl = document.querySelector(`audio[data-peer="${peerId}"]`);
  if (audioEl) audioEl.remove();
});

socket.on('voice-signal', async ({ from, signal }) => {
  if (!micEnabled) return;

  if (signal.type === 'offer') {
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('voice-signal', { to: from, signal: { type: 'answer', sdp: answer.sdp } });
  } else if (signal.type === 'answer') {
    if (peers[from]) {
      await peers[from].setRemoteDescription(new RTCSessionDescription(signal));
    }
  } else if (signal.type === 'ice-candidate') {
    if (peers[from]) {
      await peers[from].addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }
});

socket.on('voice-users', (userIds) => {});

function createPeerConnection(peerId) {
  if (peers[peerId]) {
    peers[peerId].close();
  }

  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[peerId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.volume = speakerVolume.value / 100;
    audio.muted = !speakerEnabled;
    audio.setAttribute('data-peer', peerId);
    document.body.appendChild(audio);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-signal', {
        to: peerId,
        signal: { type: 'ice-candidate', candidate: event.candidate }
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      pc.close();
      delete peers[peerId];
      const audioEl = document.querySelector(`audio[data-peer="${peerId}"]`);
      if (audioEl) audioEl.remove();
    }
  };

  return pc;
}
