// ---- VOICE CHAT (WebRTC) ----
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');

let localStream = null;
let peers = {}; // { peerId: RTCPeerConnection }
let micEnabled = false;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Toggle microphone
micBtn.addEventListener('click', async () => {
  if (!micEnabled) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micEnabled = true;
      micBtn.className = 'mic-on';
      micBtn.textContent = '🎤 Мікрофон увімкнено';
      micStatus.textContent = 'Голос активний';
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
    // Close all peer connections
    Object.keys(peers).forEach(peerId => {
      peers[peerId].close();
      delete peers[peerId];
    });
    micBtn.className = 'mic-off';
    micBtn.textContent = '🎤 Увімкнути мікрофон';
    micStatus.textContent = 'Мікрофон вимкнено';
    socket.emit('voice-leave');
  }
});

// --- WebRTC Signaling via Socket.IO ---

// When another user joins voice, create an offer to them
socket.on('voice-user-joined', async (peerId) => {
  if (!micEnabled) return;
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('voice-signal', { to: peerId, signal: { type: 'offer', sdp: offer.sdp } });
});

// When a user leaves voice
socket.on('voice-user-left', (peerId) => {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
  }
});

// Receive signal (offer/answer/ice-candidate)
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

// Get list of current voice users when joining
socket.on('voice-users', (userIds) => {
  // We'll receive offers from them via voice-user-joined
});

function createPeerConnection(peerId) {
  if (peers[peerId]) {
    peers[peerId].close();
  }

  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[peerId] = pc;

  // Add local audio tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // When we get remote audio, play it
  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.setAttribute('data-peer', peerId);
    document.body.appendChild(audio);
  };

  // ICE candidates
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
      // Remove audio element
      const audioEl = document.querySelector(`audio[data-peer="${peerId}"]`);
      if (audioEl) audioEl.remove();
    }
  };

  return pc;
}
