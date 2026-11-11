import { icon } from './icons.js';

/* ------------------------------------------------------------------ */
/* Mini moteur de DOM (sans innerHTML pour les données utilisateur)    */
/* ------------------------------------------------------------------ */

export function h(tag, props, ...children) {
  const element = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class') {
        element.className = value;
      } else if (key === 'html') {
        element.innerHTML = value;
      } else if (key === 'dataset') {
        Object.assign(element.dataset, value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in element) {
        element[key] = value;
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  append(element, children);
  return element;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function frag(...children) {
  const fragment = document.createDocumentFragment();
  append(fragment, children);
  return fragment;
}

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

function hashHue(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return hash;
}

export function avatarEl(user, { size = 44, className = '' } = {}) {
  const hue = hashHue(user?.username ?? 'robot');
  const element = h('span', {
    class: `avatar ${className}`.trim(),
    title: user?.username ? `@${user.username}` : '',
    style: {
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.46)}px`,
      background: `linear-gradient(140deg, hsl(${hue} 82% 58%), hsl(${(hue + 75) % 360} 84% 46%))`,
    },
  });
  element.textContent = user?.avatar || '🤖';
  return element;
}

/* ------------------------------------------------------------------ */
/* Texte enrichi                                                      */
/* ------------------------------------------------------------------ */

/** Normalise un hashtag : minuscules, sans accents, sans ponctuation. */
export function normalizeTag(value) {
  return String(value ?? '')
    .slice(0, 100)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 30);
}

export function richText(text) {
  const fragment = document.createDocumentFragment();
  const matcher = /(@[a-z0-9_]{3,20})|(#[\p{L}\p{N}_]{1,40})/giu;
  let cursor = 0;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    }
    if (match[1]) {
      const username = match[1].slice(1).toLowerCase();
      fragment.append(
        h('a', { class: 'mention', href: `#/u/${encodeURIComponent(username)}` }, match[1])
      );
    } else {
      const tag = normalizeTag(match[2]);
      fragment.append(
        tag
          ? h(
              'a',
              { class: 'hashtag', href: `#/tag/${encodeURIComponent(tag)}` },
              match[2]
            )
          : document.createTextNode(match[2])
      );
    }
    cursor = matcher.lastIndex;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }
  return fragment;
}

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

export function formatCount(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace('.0', '')} M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace('.0', '')} k`;
  return String(number);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;

  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Temps restant avant expiration, ex. « 11 h 42 ». */
export function remaining(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'expiré';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'moins d’1 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

export function updateCountdowns() {
  for (const element of document.querySelectorAll('[data-expires]')) {
    const value = remaining(element.dataset.expires);
    const expired = value === 'expiré';
    element.textContent = expired ? '⌛ expiré' : `⏳ ${value}`;
    element.classList.toggle('is-expired', expired);
  }
}

/* ------------------------------------------------------------------ */
/* Toasts                                                             */
/* ------------------------------------------------------------------ */

export function toast(message, type = 'info', { duration = 3800 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const element = h('div', { class: `toast toast--${type}`, role: 'status' }, message);
  root.append(element);

  setTimeout(() => {
    element.classList.add('is-out');
    setTimeout(() => element.remove(), 260);
  }, duration);

  return element;
}

/* ------------------------------------------------------------------ */
/* Modales                                                            */
/* ------------------------------------------------------------------ */

const modalStack = [];

export function openModal(content, { title, className = '', onClose } = {}) {
  const root = document.getElementById('modal-root');
  const panel = h(
    'div',
    { class: `modal ${className}`.trim(), role: 'dialog', 'aria-modal': 'true' },
    title
      ? h(
          'div',
          { class: 'modal-head' },
          h('h2', null, title),
          h(
            'button',
            { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: () => closeModal() },
            icon('close')
          )
        )
      : null,
    h('div', { class: 'modal-body' }, content)
  );

  const overlay = h(
    'div',
    {
      class: 'overlay',
      style: { zIndex: String(120 + modalStack.length) },
      onclick: (event) => {
        if (event.target === overlay) closeModal();
      },
    },
    panel
  );

  // Les modales s'empilent : on peut ouvrir la caméra par-dessus le composeur.
  root.append(overlay);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  modalStack.push({ overlay, onClose });

  setTimeout(() => {
    panel
      .querySelector('textarea, input:not([type="hidden"]), button')
      ?.focus({ preventScroll: true });
  }, 40);

  return { panel, close: closeModal };
}

export function closeModal() {
  const entry = modalStack.pop();
  if (!entry) return;
  const { overlay, onClose } = entry;
  overlay.classList.remove('is-open');
  if (!modalStack.length) document.body.classList.remove('modal-open');
  setTimeout(() => overlay.remove(), 170);
  onClose?.();
}

export function closeAllModals() {
  while (modalStack.length) closeModal();
}

function confirmDialog({
  title = 'Confirmer',
  message = '',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    const content = h(
      'div',
      { class: 'confirm' },
      h('p', { class: 'confirm-text' }, message),
      h(
        'div',
        { class: 'row-end' },
        h('button', { class: 'btn-ghost', type: 'button', onclick: () => finish(false) }, cancelLabel),
        h(
          'button',
          {
            class: `btn-primary${danger ? ' btn-danger' : ''}`,
            type: 'button',
            onclick: () => finish(true),
          },
          confirmLabel
        )
      )
    );

    openModal(content, {
      title,
      onClose: () => {
        if (settled) return;
        settled = true;
        resolve(false);
      },
    });
  });
}

export { confirmDialog };

/* ------------------------------------------------------------------ */
/* Lightbox                                                           */
/* ------------------------------------------------------------------ */

export function openLightbox(src) {
  const overlay = h(
    'div',
    { class: 'lightbox', onclick: () => overlay.remove() },
    h('img', { src, alt: 'Image plein écran' }),
    h(
      'button',
      { class: 'lightbox-close', type: 'button', 'aria-label': 'Fermer', onclick: () => overlay.remove() },
      icon('close', 24)
    )
  );
  document.body.append(overlay);
}

/* ------------------------------------------------------------------ */
/* Divers                                                             */
/* ------------------------------------------------------------------ */

export function emptyState({ iconName = 'sparkles', title, text, actions = [] }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, 30)),
    h('h3', null, title),
    text ? h('p', null, text) : null,
    actions.length ? h('div', { class: 'empty-actions' }, actions) : null
  );
}

export function backButton(label = 'Retour') {
  return h(
    'button',
    { class: 'back-btn', type: 'button', onclick: () => history.back() },
    icon('back', 18),
    h('span', null, label)
  );
}

export function viewHead(title, { back = false, right = null } = {}) {
  return h(
    'header',
    { class: 'view-head' },
    back ? backButton('Retour') : h('h1', null, title),
    back ? h('h1', null, title) : null,
    h('div', { class: 'view-head-right' }, right)
  );
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});
