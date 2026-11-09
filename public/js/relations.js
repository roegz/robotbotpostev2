import { get, post, del } from './api.js';
import { state, go, emit, on } from './state.js';
import { h, avatarEl, toast, openModal, closeModal, confirmDialog } from './ui.js';
import { icon } from './icons.js';

/* ------------------------------------------------------------------ */
/* Relations (amis) — cache partagé par le feed, les reels et le profil */
/* ------------------------------------------------------------------ */

const cache = new Map();
let loaded = false;
let loading = null;

export function loadRelations({ force = false } = {}) {
  if (loading) return loading;
  if (loaded && !force) return Promise.resolve(cache);

  loading = (async () => {
    try {
      const data = await get('/friends');
      cache.clear();
      for (const friend of data.friends ?? []) {
        cache.set(friend.username, {
          state: 'friends',
          friendship_id: friend.friendship_id,
        });
      }
      for (const entry of data.outgoing ?? []) {
        cache.set(entry.user.username, {
          state: 'outgoing',
          friendship_id: entry.friendship_id,
        });
      }
      for (const entry of data.incoming ?? []) {
        cache.set(entry.user.username, {
          state: 'incoming',
          friendship_id: entry.friendship_id,
        });
      }
      loaded = true;
      emit('relations:loaded');
    } catch {
      // Pas critique : les boutons retomberont sur « Ajouter ».
    } finally {
      loading = null;
    }
    return cache;
  })();

  return loading;
}

export function relationFor(username) {
  if (!username) return { state: 'none' };
  if (state.me?.username === username) return { state: 'self' };
  return cache.get(username) ?? { state: 'none' };
}

function setRelation(username, relation) {
  cache.set(username, relation);
  emit('relations:changed', { username, relation });
}

export async function addFriend(user) {
  const relation = relationFor(user.username);
  if (relation.state === 'friends') {
    toast('Vous êtes déjà amis.', 'info');
    return relation;
  }
  if (relation.state === 'outgoing') {
    toast('Demande d’ami déjà envoyée.', 'info');
    return relation;
  }

  try {
    if (relation.state === 'incoming' && relation.friendship_id) {
      await post(`/friends/${relation.friendship_id}/accept`);
      const next = { state: 'friends', friendship_id: relation.friendship_id };
      setRelation(user.username, next);
      toast('Vous êtes maintenant amis !', 'success');
      return next;
    }

    const result = await post('/friends/request', { username: user.username });
    const next = result.relation ?? { state: 'outgoing' };
    setRelation(user.username, next);
    toast(
      next.state === 'friends' ? 'Vous êtes maintenant amis !' : 'Demande d’ami envoyée.',
      'success'
    );
    return next;
  } catch (error) {
    toast(error.message, 'error');
    return relation;
  }
}

export async function cancelFriend(user) {
  const relation = relationFor(user.username);
  if (!relation.friendship_id) return;

  const confirmed = await confirmDialog({
    title: 'Annuler la demande ?',
    message: `@${user.username} ne recevra plus ta demande d’ami.`,
    confirmLabel: 'Annuler la demande',
    danger: true,
  });
  if (!confirmed) return;

  try {
    await del(`/friends/${relation.friendship_id}`);
    setRelation(user.username, { state: 'none' });
    toast('Demande d’ami annulée.', 'info');
  } catch (error) {
    toast(error.message, 'error');
  }
}

export function messageUser(user) {
  if (!user?.username) return;
  go(`messages/${encodeURIComponent(user.username)}`);
}

/* ------------------------------------------------------------------ */
/* Boutons rapides « message » + « ami »                              */
/* ------------------------------------------------------------------ */

const FRIEND_META = {
  none: ['userPlus', (user) => `Ajouter @${user.username} en ami`],
  incoming: ['check', (user) => `Accepter la demande de @${user.username}`],
  outgoing: ['clock', () => 'Demande d’ami en attente'],
  friends: ['users', () => 'Vous êtes amis'],
};

export function quickSocialActions(
  user,
  { className = '', vertical = false, size = 17 } = {}
) {
  if (!user?.username || user.username === state.me?.username) return null;

  const messageBtn = h(
    'button',
    {
      class: 'quick-btn quick-btn--message',
      type: 'button',
      title: `Écrire à @${user.username}`,
      'aria-label': `Écrire à @${user.username}`,
      onclick: (event) => {
        event.stopPropagation();
        messageUser(user);
      },
    },
    icon('chat', size)
  );

  const friendBtn = h(
    'button',
    {
      class: 'quick-btn quick-btn--friend',
      type: 'button',
      onclick: async (event) => {
        event.stopPropagation();
        const relation = relationFor(user.username);
        if (relation.state === 'outgoing') {
          await cancelFriend(user);
          return;
        }
        await addFriend(user);
      },
    },
    icon('userPlus', size)
  );

  function sync() {
    const relation = relationFor(user.username);
    const [iconName, label] = FRIEND_META[relation.state] ?? FRIEND_META.none;
    friendBtn.dataset.state = relation.state;
    friendBtn.classList.toggle('is-friends', relation.state === 'friends');
    friendBtn.classList.toggle('is-pending', relation.state === 'outgoing');
    friendBtn.replaceChildren(icon(iconName, size));
    friendBtn.title = label(user);
    friendBtn.setAttribute('aria-label', label(user));
  }

  sync();
  loadRelations().then(() => {
    if (friendBtn.isConnected) sync();
  });

  const off = on('relations:changed', (detail) => {
    if (!friendBtn.isConnected) {
      off();
      return;
    }
    if (detail?.username === user.username) sync();
  });

  return h(
    'div',
    {
      class: `quick-actions${vertical ? ' quick-actions--stack' : ''}${className ? ` ${className}` : ''}`,
    },
    messageBtn,
    friendBtn
  );
}

/* ------------------------------------------------------------------ */
/* Nouveau message                                                    */
/* ------------------------------------------------------------------ */

export function openNewMessageDialog() {
  const input = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Chercher un pseudo ou un nom…',
    autocomplete: 'off',
  });
  const list = h('div', { class: 'people-list new-message-list' });
  let timer = null;
  let requestId = 0;

  function personButton(user) {
    return h(
      'button',
      {
        class: 'person-row person-row--button',
        type: 'button',
        onclick: () => {
          closeModal();
          messageUser(user);
        },
      },
      avatarEl(user, { size: 42 }),
      h(
        'div',
        { class: 'person-info' },
        h('b', null, user.display_name),
        h('span', { class: 'person-handle' }, `@${user.username}`),
        user.bio ? h('span', { class: 'person-bio' }, user.bio) : null
      ),
      h('span', { class: 'pill pill--ghost' }, icon('chat', 14), 'Écrire')
    );
  }

  async function showFriends() {
    const id = ++requestId;
    try {
      const data = await get('/friends');
      if (id !== requestId || !list.isConnected) return;
      list.replaceChildren();
      if (!data.friends.length) {
        list.append(h('p', { class: 'muted small pad' }, 'Tape un pseudo pour trouver quelqu’un.'));
        return;
      }
      list.append(h('h2', { class: 'section-title' }, 'Tes amis'));
      for (const friend of data.friends) list.append(personButton(friend));
    } catch {
      list.replaceChildren(h('p', { class: 'muted small pad' }, 'Impossible de charger tes amis.'));
    }
  }

  async function search(query) {
    const id = ++requestId;
    try {
      const data = await get(`/users/search?q=${encodeURIComponent(query)}`);
      if (id !== requestId || !list.isConnected) return;
      list.replaceChildren();
      const users = (data.users ?? []).filter((user) => user.username !== state.me?.username);
      if (!users.length) {
        list.append(h('p', { class: 'muted small pad' }, 'Aucun résultat.'));
        return;
      }
      list.append(h('h2', { class: 'section-title' }, 'Résultats'));
      for (const user of users) list.append(personButton(user));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (!query) {
      showFriends();
      return;
    }
    timer = setTimeout(() => search(query), 240);
  });

  openModal(h('div', { class: 'form new-message' }, input, list), {
    title: 'Nouveau message',
  });
  showFriends();
}
