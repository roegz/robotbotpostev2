import { get, post } from './api.js';
import { state, on, go, currentPath, setUnread, emit } from './state.js';
import { h, avatarEl, toast, updateCountdowns, closeAllModals } from './ui.js';
import { icon, brandMark } from './icons.js';
import { feedView, tagView, reelsView, postDetailView, openComposer } from './posts.js';
import { profileView, friendsView } from './social.js';
import { chatView } from './chat.js';
import { renderAuth } from './authView.js';

const appEl = document.getElementById('app');
let lastRenderedPath = null;

// Active le mode « grille-pain » (appareil modeste / économie de données).
document.documentElement.classList.toggle('lite', state.lite);

/* ------------------------------------------------------------------ */
/* Coquille (sidebar + barre mobile)                                   */
/* ------------------------------------------------------------------ */

function navLink(iconName, label, target, active, badge) {
  return h(
    'a',
    { class: `nav-link${active ? ' is-active' : ''}`, href: `#/${target}` },
    icon(iconName, 21),
    h('span', { class: 'nav-label' }, label),
    badge !== undefined
      ? h(
          'span',
          { class: 'nav-badge', dataset: { unread: '' }, hidden: badge === 0 },
          badge > 99 ? '99+' : String(badge)
        )
      : null
  );
}

function tabLink(iconName, label, target, active, badge) {
  return h(
    'a',
    { class: `tab-link${active ? ' is-active' : ''}`, href: `#/${target}` },
    badge !== undefined
      ? h(
          'span',
          { class: 'tab-icon' },
          icon(iconName, 23),
          h(
            'span',
            { class: 'nav-badge nav-badge--tab', dataset: { unread: '' }, hidden: badge === 0 },
            badge > 99 ? '99+' : String(badge)
          )
        )
      : h('span', { class: 'tab-icon' }, icon(iconName, 23)),
    h('span', { class: 'tab-label' }, label)
  );
}

function drawShell() {
  const me = state.me;
  const path = currentPath();

  const section = !path
    ? 'home'
    : path === 'scroll' || path.startsWith('scroll/tag/')
      ? 'reels'
      : path.startsWith('messages')
        ? 'chat'
        : path === 'friends'
          ? 'friends'
          : path.startsWith('u/')
            ? 'profile'
            : 'home';

  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h(
      'a',
      { class: 'brand', href: '#/' },
      brandMark(36),
      h('span', { class: 'brand-text' }, 'robotbotposte')
    ),
    h('p', { class: 'brand-tag' }, 'tout s’efface en ', h('b', null, `${state.config.ttl_hours} h`)),
    h(
      'nav',
      { class: 'nav' },
      navLink('home', 'Accueil', '', section === 'home'),
      navLink('reels', 'Scroll', 'scroll', section === 'reels'),
      navLink('chat', 'Messages', 'messages', section === 'chat', state.unread),
      navLink('users', 'Amis', 'friends', section === 'friends'),
      navLink('user', 'Profil', `u/${me.username}`, section === 'profile')
    ),
    h(
      'button',
      { class: 'btn-primary side-compose', type: 'button', onclick: () => openComposer() },
      icon('plus', 20),
      'Poster'
    ),
    h(
      'div',
      { class: 'side-user' },
      h(
        'a',
        { class: 'side-user-link', href: `#/u/${me.username}` },
        avatarEl(me, { size: 40 }),
        h(
          'div',
          { class: 'side-user-info' },
          h('b', null, me.display_name),
          h('span', null, `@${me.username}`)
        )
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Se déconnecter',
          'aria-label': 'Se déconnecter',
          onclick: logout,
        },
        icon('logout', 19)
      )
    )
  );

  const tabbar = h(
    'nav',
    { class: 'tabbar' },
    tabLink('home', 'Accueil', '', section === 'home'),
    tabLink('reels', 'Scroll', 'scroll', section === 'reels'),
    h(
      'button',
      {
        class: 'tab-compose',
        type: 'button',
        'aria-label': 'Poster',
        onclick: () => openComposer(),
      },
      icon('plus', 24)
    ),
    tabLink('chat', 'Messages', 'messages', section === 'chat', state.unread),
    tabLink('user', 'Profil', `u/${me.username}`, section === 'profile')
  );

  const mainClass = ['main'];
  if (section === 'chat') mainClass.push('main--wide');
  if (section === 'reels') mainClass.push('main--reels');

  appEl.replaceChildren(
    h(
      'div',
      { class: 'layout' },
      sidebar,
      h('main', { class: mainClass.join(' ') }, h('div', { id: 'view', class: 'view' })),
      tabbar
    )
  );
}

/* ------------------------------------------------------------------ */
/* Routeur                                                            */
/* ------------------------------------------------------------------ */

function renderRoute() {
  const path = currentPath();

  if (!state.me) {
    lastRenderedPath = null;
    renderAuth(appEl);
    return;
  }

  if (path === 'login' || path === 'register' || path === 'auth') {
    go('');
    return;
  }

  // Un rafraîchissement de la même route (like, message, retour) ne doit pas
  // faire remonter la page ni revenir en haut des reels.
  const samePath = path === lastRenderedPath;
  const previousScroll = samePath ? window.scrollY : 0;
  const previousReels = samePath ? (document.querySelector('.reels')?.scrollTop ?? 0) : 0;
  lastRenderedPath = path;

  // Coupe les médias en cours : sans ça, le son d'une vidéo peut continuer
  // après un changement de page (le DOM est remplacé mais la lecture non).
  document.querySelectorAll('video, audio').forEach((media) => media.pause());

  drawShell();

  const view = document.getElementById('view');
  if (!samePath) window.scrollTo({ top: 0, behavior: 'instant' });

  let result;
  if (!path) {
    result = feedView(view);
  } else if (path === 'scroll') {
    result = reelsView(view);
  } else if (path.startsWith('scroll/tag/')) {
    result = reelsView(view, decodeURIComponent(path.slice('scroll/tag/'.length)));
  } else if (path.startsWith('tag/')) {
    result = tagView(view, decodeURIComponent(path.slice('tag/'.length)));
  } else if (path === 'messages') {
    result = chatView(view, null);
  } else if (path.startsWith('messages/')) {
    result = chatView(view, decodeURIComponent(path.slice('messages/'.length)));
  } else if (path === 'friends') {
    result = friendsView(view);
  } else if (path.startsWith('u/')) {
    result = profileView(view, decodeURIComponent(path.slice(2)));
  } else if (path.startsWith('post/')) {
    result = postDetailView(view, path.slice(5));
  } else {
    result = feedView(view);
  }

  Promise.resolve(result)
    .catch((error) => {
      console.error(error);
      toast(error.message || 'Une erreur est survenue.', 'error');
      view.append(
        h(
          'div',
          { class: 'empty' },
          h('h3', null, 'Impossible d’afficher cette page'),
          h('p', null, error.message || 'Réessaie dans un instant.')
        )
      );
    })
    .then(() => {
      if (!samePath) return;
      requestAnimationFrame(() => {
        const reelsEl = document.querySelector('.reels');
        if (reelsEl) reelsEl.scrollTop = previousReels;
        window.scrollTo({ top: previousScroll, behavior: 'instant' });
      });
    });
}

/* ------------------------------------------------------------------ */
/* Temps réel                                                         */
/* ------------------------------------------------------------------ */

async function connectSocket() {
  if (state.socket || !state.me) return;

  try {
    const { io } = await import('/socket.io/socket.io.esm.min.js');
    const socket = io({ withCredentials: true });

    socket.on('dm:new', ({ message, other }) => {
      const incoming = message.sender_id !== state.me.id;
      const path = currentPath();
      const viewing =
        path.startsWith('messages/') &&
        decodeURIComponent(path.slice('messages/'.length)) === other?.username;

      if (incoming && !viewing) {
        setUnread(state.unread + 1);
        toast(`💬 ${other?.username ?? 'Quelqu’un'} : ${message.content.slice(0, 60)}`, 'info');
      }

      emit('dm', { message, other });
    });

    socket.on('dm:typing', (payload) => {
      emit('typing', payload);
    });

    socket.on('friend:request', ({ from }) => {
      toast(`🤝 Nouvelle demande d’ami de @${from?.username}`, 'info');
    });

    socket.on('friend:accepted', ({ username }) => {
      toast(`✅ @${username} a accepté ta demande d’ami`, 'success');
    });

    state.socket = socket;
  } catch (error) {
    console.warn('[socket] indisponible :', error);
  }
}

async function refreshUnread() {
  if (!state.me) return;
  try {
    const data = await get('/messages');
    setUnread(data.unread ?? 0);
  } catch {
    // silencieux : une pastille n'est pas critique
  }
}

/* ------------------------------------------------------------------ */
/* Session                                                            */
/* ------------------------------------------------------------------ */

async function logout() {
  try {
    await post('/auth/logout');
  } catch {
    // on continue quand même
  }

  state.me = null;
  state.socket?.disconnect();
  state.socket = null;
  setUnread(0);
  closeAllModals();
  lastRenderedPath = null;
  location.hash = '#/';
  renderRoute();
}

async function boot() {
  try {
    const [config, me] = await Promise.all([
      get('/config').catch(() => null),
      get('/auth/me').catch(() => ({ user: null })),
    ]);

    if (config) state.config = { ...state.config, ...config };
    state.me = me?.user ?? null;
  } catch (error) {
    console.error('[boot]', error);
  }

  if (state.me) {
    connectSocket();
    refreshUnread();
  }

  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('rbp:unauthorized', () => {
    if (state.me) logout();
  });

  on('refresh', () => renderRoute());
  on('auth:success', () => {
    connectSocket();
    refreshUnread();
    renderRoute();
  });
  on('unread:refresh', refreshUnread);

  setInterval(updateCountdowns, 30_000);
  renderRoute();
  updateCountdowns();
}

boot();
