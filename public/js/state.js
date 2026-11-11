const FEED_SCOPES = ['friends', 'all', 'top', 'random'];

function detectLiteMode() {
  if (typeof navigator === 'undefined') return false;
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return true;

  const memory = Number(navigator.deviceMemory);
  if (Number.isFinite(memory) && memory > 0 && memory <= 4) return true;

  const cores = Number(navigator.hardwareConcurrency);
  if (Number.isFinite(cores) && cores > 0 && cores <= 4) return true;

  return false;
}

function storedFeedScope() {
  try {
    const value = localStorage.getItem('rbp_feed_scope');
    return FEED_SCOPES.includes(value) ? value : 'friends';
  } catch {
    return 'friends';
  }
}

export const state = {
  me: null,
  config: {
    app: 'robotbotposte',
    ttl_hours: 12,
    max_post_length: 500,
    max_comment_length: 300,
    max_message_length: 1000,
    max_upload_mb: 40,
    avatars: ['🤖', '👾', '🦾', '🛸', '💠', '🌀', '⚡', '🔥', '🌟', '🎧'],
  },
  socket: null,
  unread: 0,
  feedScope: storedFeedScope(),
  // « Mode grille-pain » : appareils modestes, économie de données ou
  // préférence système. Il réduit les effets et la taille des lots chargés.
  lite: detectLiteMode(),
};

const bus = new EventTarget();

export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, handler) {
  const wrapped = (event) => handler(event.detail);
  bus.addEventListener(name, wrapped);
  return () => bus.removeEventListener(name, wrapped);
}

/** Navigue vers une route interne (sans le préfixe #/). */
export function go(path) {
  const clean = String(path ?? '').replace(/^#?\/?/, '');
  const target = `#/${clean}`;
  if (location.hash === target) {
    emit('refresh');
    return;
  }
  location.hash = target;
}

export function currentPath() {
  return location.hash.replace(/^#\/?/, '');
}

export function setUnread(count) {
  state.unread = Math.max(0, count);
  for (const badge of document.querySelectorAll('[data-unread]')) {
    badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
    badge.hidden = state.unread === 0;
  }
}
