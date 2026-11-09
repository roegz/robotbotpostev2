import { state } from './state.js';
import { h, toast, openModal, closeModal } from './ui.js';
import { icon } from './icons.js';
import { uploadFile } from './api.js';

/* ------------------------------------------------------------------ */
/* Enregistrement vidéo intégré (caméra + micro, mobile et PC)         */
/* ------------------------------------------------------------------ */

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const MAX_RECORDING_MS = 60_000;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // on continue
    }
  }
  return '';
}

function baseMimeType(type) {
  const base = String(type || 'video/webm').split(';')[0].trim();
  return base.startsWith('video/') ? base : 'video/webm';
}

function extensionFor(type) {
  return type === 'video/mp4' ? 'mp4' : 'webm';
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Accès refusé. Autorise la caméra et le micro dans ton navigateur, puis réessaie.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Aucune caméra trouvée sur cet appareil.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'La caméra est déjà utilisée par une autre application.';
    case 'OverconstrainedError':
      return 'Cette caméra ne supporte pas le format demandé.';
    default:
      return `Caméra indisponible : ${error?.message || 'erreur inconnue'}.`;
  }
}

export function openVideoRecorder({ sound = null, onDone } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('Ton navigateur ne permet pas de filmer une vidéo. Utilise « Média » pour importer un fichier.', 'error');
    return null;
  }
  if (!window.isSecureContext) {
    toast('La caméra nécessite HTTPS (ou localhost). Sur Render, le site est déjà en HTTPS.', 'error');
    return null;
  }

  let stream = null;
  let recorder = null;
  let chunks = [];
  let recordedBlob = null;
  let recordedUrl = null;
  let facing = 'user';
  let recording = false;
  let timerId = null;
  let startedAt = 0;
  let audioCtx = null;
  let soundEl = null;
  let soundNode = null;
  let destination = null;
  let includeSound = Boolean(sound?.url);
  let closed = false;

  const video = h('video', {
    class: 'recorder-video',
    autoplay: true,
    playsinline: true,
    muted: true,
  });
  const timerEl = h('span', { class: 'recorder-timer' }, '0:00');
  const soundChip =
    sound?.author?.username
      ? h('span', { class: 'recorder-sound' }, icon('music', 14), ` @${sound.author.username}`)
      : null;
  const stage = h('div', { class: 'recorder-stage' }, video, h('div', { class: 'recorder-top' }, timerEl, soundChip));

  const status = h('p', { class: 'recorder-status' }, 'Préparation de la caméra…');

  const recordBtn = h(
    'button',
    {
      class: 'recorder-record',
      type: 'button',
      title: 'Démarrer l’enregistrement',
      'aria-label': 'Démarrer l’enregistrement',
      onclick: () => (recording ? stopRecording() : startRecording()),
    },
    icon('record', 30)
  );

  const flipBtn = h(
    'button',
    {
      class: 'recorder-btn',
      type: 'button',
      title: 'Changer de caméra',
      'aria-label': 'Changer de caméra',
      onclick: () => flipCamera(),
    },
    icon('flip', 20)
  );

  const retakeBtn = h(
    'button',
    { class: 'btn-ghost btn-sm', type: 'button', onclick: () => resetRecording() },
    'Recommencer'
  );

  const useBtn = h(
    'button',
    { class: 'btn-primary btn-sm', type: 'button', disabled: true, onclick: () => uploadRecording() },
    icon('check', 16),
    'Utiliser la vidéo'
  );

  const soundToggle = sound?.url
    ? h(
        'label',
        { class: 'recorder-sound-toggle' },
        h('input', {
          type: 'checkbox',
          checked: includeSound,
          onchange: (event) => {
            includeSound = event.target.checked;
          },
        }),
        icon('music', 14),
        ` Garder le son de @${sound.author?.username ?? 'la vidéo'}`
      )
    : null;

  const uploadBar = h('i');
  const uploadWrap = h('div', { class: 'upload-progress', hidden: true }, uploadBar);

  const body = h(
    'div',
    { class: 'recorder' },
    stage,
    status,
    soundToggle,
    h(
      'div',
      { class: 'recorder-controls' },
      flipBtn,
      recordBtn,
      h('span', { class: 'recorder-controls-spacer' })
    ),
    h('div', { class: 'recorder-actions' }, retakeBtn, useBtn),
    uploadWrap
  );

  retakeBtn.hidden = true;

  const modal = openModal(body, {
    title: sound?.url ? 'Filmer avec ce son' : 'Filmer une vidéo',
    className: 'modal--recorder',
    onClose: cleanup,
  });

  startCamera();
  return modal;

  /* ---------------------------------------------------------------- */

  async function startCamera() {
    stopStream();
    status.textContent = 'Autorise la caméra et le micro…';
    recordBtn.disabled = true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (closed) {
        stopStream();
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.controls = false;
      await video.play().catch(() => {});

      status.textContent = 'Prêt ! Appuie sur le bouton blanc pour filmer.';
      recordBtn.disabled = false;
    } catch (error) {
      status.textContent = cameraErrorMessage(error);
      recordBtn.disabled = true;
    }
  }

  async function flipCamera() {
    if (recording) return;
    facing = facing === 'user' ? 'environment' : 'user';
    resetRecorded();
    retakeBtn.hidden = true;
    flipBtn.hidden = false;
    recordBtn.hidden = false;
    useBtn.disabled = true;
    video.controls = false;
    video.removeAttribute('src');
    video.loop = false;
    await startCamera();
  }

  async function startRecording() {
    if (recording || !stream) return;

    recordBtn.disabled = true;
    recordBtn.hidden = false;
    status.textContent = 'Préparation…';

    const recordingStream = await prepareAudioMix();
    if (closed) {
      for (const track of recordingStream.getTracks()) track.stop();
      return;
    }

    const mimeType = pickMimeType();
    try {
      recorder = new MediaRecorder(
        recordingStream,
        mimeType ? { mimeType, videoBitsPerSecond: 2_200_000 } : { videoBitsPerSecond: 2_200_000 }
      );
    } catch {
      try {
        recorder = new MediaRecorder(recordingStream);
      } catch (error) {
        console.warn('[recorder]', error);
        status.textContent = 'Impossible de démarrer l’enregistrement sur ce navigateur.';
        cleanupAudio();
        recordBtn.disabled = false;
        return;
      }
    }

    const effectiveType = baseMimeType(recorder.mimeType || mimeType || 'video/webm');
    chunks = [];
    let elapsed = 0;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      if (closed) return;

      recording = false;
      clearInterval(timerId);
      timerId = null;
      elapsed = Date.now() - startedAt;

      const blob = new Blob(chunks, { type: effectiveType });
      recordedBlob = blob;
      recordedUrl = URL.createObjectURL(blob);

      stopStream();
      cleanupAudio();

      timerEl.textContent = formatDuration(elapsed);
      video.pause();
      video.removeAttribute('src');
      video.srcObject = null;
      video.src = recordedUrl;
      video.controls = true;
      video.loop = true;
      video.muted = false;
      video.play().catch(() => {});

      recordBtn.hidden = true;
      flipBtn.hidden = true;
      retakeBtn.hidden = false;
      retakeBtn.disabled = false;
      useBtn.disabled = false;
      status.textContent = `Vidéo prête (${formatDuration(elapsed)} · ${formatSize(blob.size)}).`;
    });

    recorder.addEventListener('error', () => {
      status.textContent = 'L’enregistrement a échoué. Réessaie.';
      recording = false;
      clearInterval(timerId);
      timerId = null;
      recordBtn.hidden = false;
      recordBtn.disabled = false;
      recordBtn.classList.remove('is-recording');
      recordBtn.replaceChildren(icon('record', 30));
      cleanupAudio();
    });

    recorder.start(1000);
    recording = true;
    startedAt = Date.now();
    recordBtn.disabled = false;
    recordBtn.classList.add('is-recording');
    recordBtn.replaceChildren(icon('stop', 28));
    recordBtn.title = 'Arrêter';
    recordBtn.setAttribute('aria-label', 'Arrêter l’enregistrement');
    status.textContent = 'Enregistrement…';

    timerId = setInterval(() => {
      const current = Date.now() - startedAt;
      timerEl.textContent = formatDuration(current);
      if (current >= MAX_RECORDING_MS) stopRecording();
    }, 200);
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    clearInterval(timerId);
    timerId = null;
    if (soundEl) {
      try {
        soundEl.pause();
      } catch {
        // rien
      }
    }
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // rien
      }
    }
  }

  function resetRecorded() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;
    recordedBlob = null;
    chunks = [];
    timerEl.textContent = '0:00';
  }

  async function resetRecording() {
    resetRecorded();
    retakeBtn.hidden = true;
    flipBtn.hidden = false;
    recordBtn.hidden = false;
    recordBtn.classList.remove('is-recording');
    recordBtn.replaceChildren(icon('record', 30));
    recordBtn.title = 'Démarrer l’enregistrement';
    recordBtn.setAttribute('aria-label', 'Démarrer l’enregistrement');
    useBtn.disabled = true;
    uploadWrap.hidden = true;
    video.controls = false;
    video.removeAttribute('src');
    video.loop = false;
    video.muted = true;
    await startCamera();
  }

  async function uploadRecording() {
    if (!recordedBlob) return;

    if (recordedBlob.size > state.config.max_upload_mb * 1024 * 1024) {
      toast(`Vidéo trop lourde (max ${state.config.max_upload_mb} Mo). Filme plus court.`, 'error');
      return;
    }

    const baseType = baseMimeType(recordedBlob.type);
    const extension = extensionFor(baseType);
    const file = new File([recordedBlob], `camera-${Date.now()}.${extension}`, {
      type: baseType,
    });

    useBtn.disabled = true;
    retakeBtn.disabled = true;
    uploadWrap.hidden = false;
    uploadBar.style.width = '2%';
    status.textContent = 'Envoi de la vidéo…';

    try {
      const result = await uploadFile(file, (ratio) => {
        uploadBar.style.width = `${Math.max(2, Math.round(ratio * 100))}%`;
      });
      const media = { url: result.url, type: 'video' };
      if (sound?.author) media.soundAuthor = sound.author;
      closeModal();
      onDone?.(media);
    } catch (error) {
      toast(error.message, 'error');
      status.textContent = 'Envoi impossible. Vérifie ta connexion et réessaie.';
      useBtn.disabled = false;
      retakeBtn.disabled = false;
      uploadWrap.hidden = true;
    }
  }

  async function prepareAudioMix() {
    const videoTracks = stream.getVideoTracks();
    let audioTracks = stream.getAudioTracks();

    if (!includeSound || !sound?.url) {
      return new MediaStream([...videoTracks, ...audioTracks]);
    }

    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error('Web Audio indisponible');

      audioCtx = new AudioCtor();
      await audioCtx.resume();
      destination = audioCtx.createMediaStreamDestination();

      if (stream.getAudioTracks().length) {
        const micSource = audioCtx.createMediaStreamSource(
          new MediaStream(stream.getAudioTracks())
        );
        const micGain = audioCtx.createGain();
        micGain.gain.value = 0.9;
        micSource.connect(micGain).connect(destination);
      }

      soundEl = h('video', {
        src: sound.url,
        loop: true,
        playsinline: true,
        preload: 'auto',
        style: {
          position: 'fixed',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
          bottom: '0',
          left: '0',
        },
      });
      document.body.append(soundEl);

      await new Promise((resolve) => {
        if (soundEl.readyState >= 1) return resolve();
        const done = () => resolve();
        soundEl.addEventListener('loadedmetadata', done, { once: true });
        soundEl.addEventListener('error', done, { once: true });
        setTimeout(done, 1800);
      });

      soundNode = audioCtx.createMediaElementSource(soundEl);
      const soundGain = audioCtx.createGain();
      soundGain.gain.value = 0.9;
      soundNode.connect(soundGain);
      soundGain.connect(destination);
      soundGain.connect(audioCtx.destination);

      soundEl.currentTime = 0;
      await soundEl.play().catch(() => {});

      const mixed = destination.stream.getAudioTracks();
      if (mixed.length) audioTracks = mixed;
    } catch (error) {
      console.warn('[recorder] son réutilisé indisponible :', error);
      cleanupAudio();
      audioTracks = stream.getAudioTracks();
    }

    return new MediaStream([...videoTracks, ...audioTracks]);
  }

  function cleanupAudio() {
    if (soundEl) {
      try {
        soundEl.pause();
      } catch {
        // rien
      }
      soundEl.remove();
      soundEl = null;
    }
    soundNode = null;
    destination = null;
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch {
        // rien
      }
      audioCtx = null;
    }
  }

  function stopStream() {
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // rien
        }
      }
      stream = null;
    }
    video.srcObject = null;
  }

  function cleanup() {
    closed = true;
    clearInterval(timerId);
    timerId = null;
    recording = false;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // rien
      }
    }
    recorder = null;
    stopStream();
    cleanupAudio();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
    recordedBlob = null;
  }
}
