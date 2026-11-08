import { get, post, patch, del } from './api.js';
import { state, go, emit } from './state.js';
import {
  h,
  avatarEl,
  toast,
  openModal,
  closeModal,
  confirmDialog,
  emptyState,
  viewHead,
  formatCount,
} from './ui.js';
import { icon } from './icons.js';
import { postCard, openComposer } from './posts.js';

/* ------------------------------------------------------------------ */
/* Profil                                                             */
/* ------------------------------------------------------------------ */

function actionButton(label, { primary = false, disabled = false, danger = false, onClick }) {
  return h(
    'button',
    {
      class: `${primary ? 'btn-primary' : 'btn-ghost'}${danger ? ' btn-danger-ghost' : ''}`,
      type: 'button',
      disabled,
      onclick: onClick,
    },
    label
  );
}

function openEditProfile(user) {
  const nameInput = h('input', {
    class: 'field',
    value: user.display_name,
    maxlength: 40,
    placeholder: 'Nom affiché',
  });
  const bioInput = h('textarea', {
    class: 'field',
    rows: 3,
    maxlength: 160,
    placeholder: 'Ta bio (160 caractères)',
    value: user.bio,
  });

  let selectedAvatar = user.avatar;
  const grid = h('div', { class: 'avatar-grid' });

  for (const emoji of state.config.avatars) {
    const button = h(
      'button',
      {
        class: `avatar-choice${emoji === selectedAvatar ? ' is-active' : ''}`,
        type: 'button',
        'aria-label': `Avatar ${emoji}`,
        onclick: () => {
          selectedAvatar = emoji;
          for (const child of grid.children) {
            child.classList.toggle('is-active', child.textContent === emoji);
          }
        },
      },
      emoji
    );
    grid.append(button);
  }

  const saveButton = h(
    'button',
    { class: 'btn-primary', type: 'button' },
    icon('check', 18),
    'Enregistrer'
  );

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      await patch('/users/me', {
        display_name: nameInput.value,
        bio: bioInput.value,
        avatar: selectedAvatar,
      });
      const me = await get('/auth/me');
      state.me = me.user;
      closeModal();
      toast('Profil mis à jour.', 'success');
      emit('refresh');
    } catch (error) {
      toast(error.message, 'error');
      saveButton.disabled = false;
    }
  });

  openModal(
    h(
      'div',
      { class: 'form' },
      h('label', null, 'Nom affiché', nameInput),
      h('label', null, 'Bio', bioInput),
      h('div', { class: 'form-label' }, 'Avatar'),
      grid,
      h('div', { class: 'row-end' }, saveButton)
    ),
    { title: 'Modifier le profil' }
  );
}

export async function profileView(root, username) {
  let data;
  try {
    data = await get(`/users/${encodeURIComponent(username)}`);
  } catch (error) {
    root.append(
      viewHead('Profil'),
      emptyState({
        iconName: 'user',
        title: 'Profil introuvable',
        text: error.message,
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => go('') },
            'Retour à l’accueil'
          ),
        ],
      })
    );
    return;
  }

  const { user, stats, relation } = data;
  const isMe = user.id === state.me.id;

  const actions = h('div', { class: 'profile-actions' });

  if (isMe) {
    actions.append(
      actionButton('Modifier le profil', {
        primary: true,
        onClick: () => openEditProfile(user),
      })
    );
  } else if (relation.state === 'none') {
    actions.append(
      actionButton('Ajouter en ami', {
        primary: true,
        onClick: async () => {
          try {
            const result = await post('/friends/request', { username: user.username });
            toast(
              result.relation.state === 'friends'
                ? 'Vous êtes maintenant amis !'
                : 'Demande d’ami envoyée.',
              'success'
            );
            emit('refresh');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      })
    );
  } else if (relation.state === 'outgoing') {
    actions.append(actionButton('Demande envoyée', { disabled: true }));
    actions.append(
      actionButton('Annuler', {
        danger: true,
        onClick: async () => {
          try {
            await del(`/friends/${relation.friendship_id}`);
            toast('Demande annulée.', 'info');
            emit('refresh');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      })
    );
  } else if (relation.state === 'incoming') {
    actions.append(
      actionButton('Accepter', {
        primary: true,
        onClick: async () => {
          try {
            await post(`/friends/${relation.friendship_id}/accept`);
            toast('Vous êtes maintenant amis !', 'success');
            emit('refresh');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      }),
      actionButton('Refuser', {
        onClick: async () => {
          try {
            await post(`/friends/${relation.friendship_id}/decline`);
            toast('Demande refusée.', 'info');
            emit('refresh');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      })
    );
  } else if (relation.state === 'friends') {
    actions.append(
      actionButton('Message', {
        primary: true,
        onClick: () => go(`messages/${user.username}`),
      }),
      actionButton('Retirer', {
        danger: true,
        onClick: async () => {
          const confirmed = await confirmDialog({
            title: 'Retirer cet ami ?',
            message: `@${user.username} ne verra plus tes posts dans son feed d’amis.`,
            confirmLabel: 'Retirer',
            danger: true,
          });
          if (!confirmed) return;
          try {
            await del(`/friends/${relation.friendship_id}`);
            toast('Ami retiré.', 'info');
            emit('refresh');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      })
    );
  }

  const head = h(
    'section',
    { class: 'profile-head' },
    h('div', { class: 'profile-cover' }),
    h(
      'div',
      { class: 'profile-row' },
      h('div', { class: 'profile-avatar-wrap' }, avatarEl(user, { size: 92 })),
      actions
    ),
    h('h1', { class: 'profile-name' }, user.display_name),
    h('p', { class: 'profile-handle' }, `@${user.username}`),
    user.bio ? h('p', { class: 'profile-bio' }, user.bio) : null,
    h(
      'div',
      { class: 'profile-stats' },
      h('span', null, h('b', null, formatCount(stats.posts)), ' posts'),
      h('span', { class: 'post-dot' }, '·'),
      h('span', null, h('b', null, formatCount(stats.friends)), ' amis'),
      h('span', { class: 'post-dot' }, '·'),
      h('span', { class: 'profile-ttl' }, icon('clock', 14), ` posts éphémères`)
    )
  );

  root.append(viewHead('Profil'), head);

  const list = h('div', { class: 'post-list' });
  const moreWrap = h('div', { class: 'more-wrap' });
  root.append(list, moreWrap);

  let cursor = null;

  async function loadPosts(first = false) {
    const query =
      `/posts?scope=user&username=${encodeURIComponent(user.username)}&limit=20` +
      (cursor
        ? `&before=${encodeURIComponent(cursor.before)}&before_id=${encodeURIComponent(cursor.before_id)}`
        : '');

    try {
      const result = await get(query);
      if (first) list.replaceChildren();

      if (first && result.posts.length === 0) {
        list.append(
          emptyState({
            iconName: 'sparkles',
            title: isMe ? 'Tu n’as aucun post actif' : 'Aucun post actif',
            text:
              'Les posts disparaissent au bout de ' +
              state.config.ttl_hours +
              ' h. Il n’y a rien à afficher pour le moment.',
            actions: isMe
              ? [
                  h(
                    'button',
                    { class: 'btn-primary', type: 'button', onclick: () => openComposer() },
                    'Créer un post'
                  ),
                ]
              : [],
          })
        );
      }

      for (const postRow of result.posts) list.append(postCard(postRow));
      cursor = result.next;

      moreWrap.replaceChildren();
      if (cursor) {
        const button = h('button', { class: 'btn-ghost load-more', type: 'button' }, 'Charger plus');
        button.addEventListener('click', () => {
          button.disabled = true;
          loadPosts();
        });
        moreWrap.append(button);
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  await loadPosts(true);
}

/* ------------------------------------------------------------------ */
/* Amis + recherche                                                   */
/* ------------------------------------------------------------------ */

function personRow(user, actionNodes) {
  return h(
    'div',
    { class: 'person-row' },
    h(
      'a',
      { class: 'person-main', href: `#/u/${user.username}` },
      avatarEl(user, { size: 46 }),
      h(
        'div',
        { class: 'person-info' },
        h('b', null, user.display_name),
        h('span', { class: 'person-handle' }, `@${user.username}`),
        user.bio ? h('span', { class: 'person-bio' }, user.bio) : null
      )
    ),
    h('div', { class: 'person-actions' }, actionNodes)
  );
}

function relationButton(user, relation, afterChange) {
  if (relation?.state === 'friends') {
    return h('span', { class: 'pill pill--ok' }, icon('check', 14), 'Amis');
  }
  if (relation?.state === 'outgoing') {
    return h(
      'button',
      {
        class: 'btn-ghost',
        type: 'button',
        onclick: async () => {
          try {
            await del(`/friends/${relation.friendship_id}`);
            toast('Demande annulée.', 'info');
            afterChange();
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      'Annuler'
    );
  }
  if (relation?.state === 'incoming') {
    return h(
      'button',
      {
        class: 'btn-primary',
        type: 'button',
        onclick: async () => {
          try {
            await post(`/friends/${relation.friendship_id}/accept`);
            toast('Vous êtes maintenant amis !', 'success');
            afterChange();
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      'Accepter'
    );
  }
  return h(
    'button',
    {
      class: 'btn-primary',
      type: 'button',
      onclick: async () => {
        try {
          const result = await post('/friends/request', { username: user.username });
          toast(
            result.relation.state === 'friends'
              ? 'Vous êtes maintenant amis !'
              : 'Demande envoyée.',
            'success'
          );
          afterChange();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    },
    'Ajouter'
  );
}

export async function friendsView(root) {
  root.append(viewHead('Amis'));

  const searchInput = h('input', {
    class: 'search-field',
    type: 'search',
    placeholder: 'Rechercher un pseudo ou un nom…',
    autocomplete: 'off',
  });

  const results = h('div', { class: 'people-list' });
  const sections = h('div', { class: 'friends-sections' });

  root.append(
    h('div', { class: 'search-wrap' }, icon('search', 18), searchInput),
    results,
    sections
  );

  let friendsData = { friends: [], incoming: [], outgoing: [] };
  let currentQuery = '';
  let searchTimer;

  async function reload() {
    try {
      friendsData = await get('/friends');
    } catch (error) {
      toast(error.message, 'error');
    }
    renderSections();
    if (currentQuery) runSearch(currentQuery);
  }

  function afterChange() {
    reload();
  }

  function renderSections() {
    sections.replaceChildren();

    if (friendsData.incoming.length) {
      sections.append(
        h(
          'section',
          { class: 'people-section' },
          h('h2', { class: 'section-title' }, 'Demandes reçues'),
          ...friendsData.incoming.map((entry) =>
            personRow(entry.user, [
              h(
                'button',
                {
                  class: 'btn-primary btn-sm',
                  type: 'button',
                  onclick: async () => {
                    try {
                      await post(`/friends/${entry.friendship_id}/accept`);
                      toast('Vous êtes maintenant amis !', 'success');
                      afterChange();
                    } catch (error) {
                      toast(error.message, 'error');
                    }
                  },
                },
                'Accepter'
              ),
              h(
                'button',
                {
                  class: 'btn-ghost btn-sm',
                  type: 'button',
                  onclick: async () => {
                    try {
                      await post(`/friends/${entry.friendship_id}/decline`);
                      toast('Demande refusée.', 'info');
                      afterChange();
                    } catch (error) {
                      toast(error.message, 'error');
                    }
                  },
                },
                'Refuser'
              ),
            ])
          )
        )
      );
    }

    sections.append(
      h(
        'section',
        { class: 'people-section' },
        h('h2', { class: 'section-title' }, `Mes amis (${friendsData.friends.length})`),
        friendsData.friends.length
          ? h(
              'div',
              { class: 'people-list' },
              ...friendsData.friends.map((friend) =>
                personRow(friend, [
                  h(
                    'button',
                    {
                      class: 'btn-ghost btn-sm',
                      type: 'button',
                      onclick: () => go(`messages/${friend.username}`),
                    },
                    'Message'
                  ),
                  h(
                    'button',
                    {
                      class: 'icon-btn danger',
                      type: 'button',
                      title: 'Retirer cet ami',
                      onclick: async () => {
                        const confirmed = await confirmDialog({
                          title: 'Retirer cet ami ?',
                          message: `@${friend.username} sera retiré de tes amis.`,
                          confirmLabel: 'Retirer',
                          danger: true,
                        });
                        if (!confirmed) return;
                        try {
                          await del(`/friends/${friend.friendship_id}`);
                          toast('Ami retiré.', 'info');
                          afterChange();
                        } catch (error) {
                          toast(error.message, 'error');
                        }
                      },
                    },
                    icon('trash', 16)
                  ),
                ])
              )
            )
          : h(
              'p',
              { class: 'muted small' },
              'Aucun ami pour le moment. Recherche un pseudo ci-dessus pour commencer.'
            )
      )
    );

    if (friendsData.outgoing.length) {
      sections.append(
        h(
          'section',
          { class: 'people-section' },
          h('h2', { class: 'section-title' }, 'Demandes envoyées'),
          ...friendsData.outgoing.map((entry) =>
            personRow(entry.user, [
              h(
                'button',
                {
                  class: 'btn-ghost btn-sm',
                  type: 'button',
                  onclick: async () => {
                    try {
                      await del(`/friends/${entry.friendship_id}`);
                      toast('Demande annulée.', 'info');
                      afterChange();
                    } catch (error) {
                      toast(error.message, 'error');
                    }
                  },
                },
                'Annuler'
              ),
            ])
          )
        )
      );
    }
  }

  async function runSearch(query) {
    try {
      const found = await get(`/users/search?q=${encodeURIComponent(query)}`);
      results.replaceChildren();

      if (!found.users.length) {
        results.append(h('p', { class: 'muted small pad' }, 'Aucun résultat.'));
        return;
      }

      results.append(
        h('h2', { class: 'section-title' }, 'Résultats'),
        ...found.users.map((user) =>
          personRow(user, [relationButton(user, user.relation, afterChange)])
        )
      );
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    currentQuery = searchInput.value.trim();

    if (!currentQuery) {
      results.replaceChildren();
      return;
    }

    searchTimer = setTimeout(() => runSearch(currentQuery), 260);
  });

  await reload();
}
