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
  feedScope: localStorage.getItem('rbp_feed_scope') === 'all' ? 'all' : 'friends',
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
