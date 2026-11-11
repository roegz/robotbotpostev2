import { get, post, del, uploadFile } from './api.js';
import { state, go, emit } from './state.js';
import {
  h,
  avatarEl,
  richText,
  normalizeTag,
  formatCount,
  timeAgo,
  remaining,
  openModal,
  closeModal,
  confirmDialog,
  toast,
  openLightbox,
  emptyState,
  viewHead,
} from './ui.js';
import { icon } from './icons.js';
import { quickSocialActions } from './relations.js';
import { openVideoRecorder } from './recorder.js';

/* ------------------------------------------------------------------ */
/* Médias                                                              */
/* ------------------------------------------------------------------ */

function mediaEl(media) {
  if (media.type === 'video') {
    const video = h('video', {
      class: 'post-media',
      src: media.url,
      controls: true,
      playsInline: true,
      preload: 'none',
    });
    observeFeedVideo(video);
    return video;
  }

  const image = h('img', {
    class: 'post-media',
    src: media.url,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
  });
  image.addEventListener('click', () => openLightbox(media.url));
  return image;
}

let feedVideoObserver = null;

/** Met en pause les vidéos du feed sorties de l'écran (CPU / batterie). */
function observeFeedVideo(video) {
  if (!('IntersectionObserver' in window)) return;
  feedVideoObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) entry.target.pause?.();
      }
    },
    { threshold: 0 }
  );
  feedVideoObserver.observe(video);
}

function quoteEl(quote) {
  if (!quote || quote.expired) return null;
  return h(
    'div',
    { class: 'quote' },
    h(
      'div',
      { class: 'quote-head' },
      avatarEl(quote.author, { size: 24 }),
      h('a', { class: 'quote-name', href: `#/u/${quote.author.username}` }, quote.author.display_name),
      h('span', { class: 'quote-handle' }, `@${quote.author.username}`),
      h('span', { class: 'post-dot' }, '·'),
      h('span', { class: 'quote-time' }, timeAgo(quote.created_at))
    ),
    quote.content ? h('p', { class: 'quote-text' }, richText(quote.content)) : null,
    quote.media
      ? quote.media.type === 'image'
        ? h('img', {
            class: 'quote-media',
            src: quote.media.url,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            onclick: () => openLightbox(quote.media.url),
          })
        : h('video', {
            class: 'quote-media',
            src: quote.media.url,
            controls: true,
            playsInline: true,
            preload: 'none',
          })
      : null
  );
}

/* ------------------------------------------------------------------ */
/* Carte de post                                                       */
/* ------------------------------------------------------------------ */

export function postCard(postRow, { detail = false } = {}) {
  const me = state.me;
  const isQuote = Boolean(postRow.repost_of);
  const isPureRepost =
    isQuote && !postRow.repost_of.expired && !postRow.content && !postRow.media;
  const shown = isPureRepost ? postRow.repost_of : postRow;

  const card = h('article', { class: `post${detail ? ' post--detail' : ''}` });

  if (isQuote) {
    if (postRow.repost_of.expired) {
      card.append(
        h(
          'div',
          { class: 'repost-line muted' },
          icon('repost', 15),
          h('span', null, 'Le post d’origine a expiré')
        )
      );
      return card;
    }
    if (isPureRepost) {
      card.append(
        h(
          'div',
          { class: 'repost-line' },
          icon('repost', 15),
          h(
            'span',
            null,
            h('a', { href: `#/u/${postRow.author.username}` }, postRow.author.display_name),
            ' a republié'
          ),
          postRow.author.id === me.id
            ? h(
                'button',
                {
                  class: 'link-btn',
                  type: 'button',
                  onclick: () => removePost(postRow, card),
                },
                'annuler'
              )
            : null
        )
      );
    }
  }

  card.append(
    h(
      'header',
      { class: 'post-head' },
      h(
        'a',
        { class: 'post-avatar-link', href: `#/u/${shown.author.username}` },
        avatarEl(shown.author, { size: detail ? 50 : 46 })
      ),
      h(
        'div',
        { class: 'post-meta' },
        h(
          'div',
          { class: 'post-meta-top' },
          h(
            'a',
            { class: 'post-name', href: `#/u/${shown.author.username}` },
            shown.author.display_name
          ),
          h(
            'a',
            { class: 'post-handle', href: `#/u/${shown.author.username}` },
            `@${shown.author.username}`
          ),
          h('span', { class: 'post-dot' }, '·'),
          h(
            'a',
            {
              class: 'post-time',
              href: `#/post/${shown.id}`,
              title: new Date(shown.created_at).toLocaleString('fr-FR'),
            },
            timeAgo(shown.created_at)
          )
        ),
        h(
          'div',
          { class: 'post-sub' },
          h(
            'span',
            { class: 'expiry', dataset: { expires: shown.expires_at } },
            `⏳ ${remaining(shown.expires_at)}`
          ),
          quickSocialActions(shown.author, { className: 'post-quick' })
        )
      )
    )
  );

  if (shown.content) {
    card.append(h('p', { class: 'post-text' }, richText(shown.content)));
  }

  if (shown.media) card.append(mediaEl(shown.media));

  if (isQuote && !isPureRepost) {
    card.append(quoteEl(postRow.repost_of));
  }

  card.append(actionsEl(postRow, shown, card, { detail }));
  return card;
}

function actionsEl(postRow, target, card, { detail = false } = {}) {
  const me = state.me;

  const likeBtn = h(
    'button',
    {
      class: `post-action${target.liked ? ' liked' : ''}`,
      type: 'button',
      'aria-label': 'J’aime',
      'aria-pressed': target.liked ? 'true' : 'false',
      onclick: async () => {
        likeBtn.disabled = true;
        try {
          const result = await post(`/posts/${target.id}/like`);
          target.liked = result.liked;
          target.counts.likes = result.count;
          likeBtn.classList.toggle('liked', result.liked);
          likeBtn.setAttribute('aria-pressed', result.liked ? 'true' : 'false');
          const counter = likeBtn.querySelector('.action-count');
          if (counter) counter.textContent = formatCount(result.count);
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          likeBtn.disabled = false;
        }
      },
    },
    icon('heart', 19),
    h('span', { class: 'action-count' }, formatCount(target.counts.likes))
  );

  const commentBtn = h(
    'button',
    {
      class: 'post-action',
      type: 'button',
      'aria-label': 'Commenter',
      onclick: () => {
        if (detail) {
          card.parentElement
            ?.querySelector('.comment-input')
            ?.focus?.();
        } else {
          go(`post/${target.id}`);
        }
      },
    },
    icon('comment', 19),
    h(
      'span',
      { class: 'action-count', dataset: { role: 'comments' } },
      formatCount(target.counts.comments)
    )
  );

  const repostBtn = h(
    'button',
    {
      class: 'post-action',
      type: 'button',
      'aria-label': 'Republier',
      onclick: () => openRepostMenu(target),
    },
    icon('repost', 19),
    h('span', { class: 'action-count' }, formatCount(target.counts.reposts))
  );

  const soundBtn =
    target.media?.type === 'video'
      ? h(
          'button',
          {
            class: 'post-action',
            type: 'button',
            title: 'Filmer une vidéo avec ce son',
            'aria-label': 'Utiliser ce son',
            onclick: () => recordWithSound(target),
          },
          icon('music', 19),
          h('span', { class: 'action-count' }, 'Son')
        )
      : null;

  return h(
    'div',
    { class: 'post-actions' },
    likeBtn,
    commentBtn,
    repostBtn,
    soundBtn,
    h('div', { class: 'spacer' }),
    postRow.author.id === me.id && !isPureRepostCard(postRow)
      ? h(
          'button',
          {
            class: 'post-action post-action--danger',
            type: 'button',
            title: 'Supprimer ce post',
            'aria-label': 'Supprimer ce post',
            onclick: () => removePost(postRow, card),
          },
          icon('trash', 18)
        )
      : null
  );
}

function isPureRepostCard(postRow) {
  return Boolean(
    postRow.repost_of && !postRow.repost_of.expired && !postRow.content && !postRow.media
  );
}

async function removePost(postRow, card) {
  const confirmed = await confirmDialog({
    title: 'Supprimer ce post ?',
    message: 'Il disparaîtra immédiatement pour tout le monde.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!confirmed) return;

  try {
    await del(`/posts/${postRow.id}`);
    card.remove();
    toast('Post supprimé.', 'success');
    emit('refresh');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openRepostMenu(target) {
  openModal(
    h(
      'div',
      { class: 'menu-list' },
      h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          onclick: async () => {
            closeModal();
            try {
              await post('/posts', { repost_of: target.id });
              toast('Republié !', 'success');
              emit('refresh');
            } catch (error) {
              toast(error.message, error.status === 409 ? 'info' : 'error');
            }
          },
        },
        icon('repost', 20),
        h('div', null, h('b', null, 'Republier'), h('span', null, 'Partager ce post à tes amis'))
      ),
      h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          onclick: () => {
            closeModal();
            openComposer({ quotePost: target });
          },
        },
        icon('edit', 20),
        h('div', null, h('b', null, 'Citer'), h('span', null, 'Ajouter un commentaire'))
      )
    ),
    { title: 'Republier' }
  );
}

function recordWithSound(postRow) {
  if (!postRow?.media?.url) return;
  openVideoRecorder({
    sound: { url: postRow.media.url, author: postRow.author },
    onDone: (media) => openComposer({ initialMedia: media }),
  });
}

/* ------------------------------------------------------------------ */
/* Composeur                                                          */
/* ------------------------------------------------------------------ */

function quotePreview(quotePost) {
  return h(
    'div',
    { class: 'quote quote--composer' },
    h(
      'div',
      { class: 'quote-head' },
      avatarEl(quotePost.author, { size: 22 }),
      h('b', null, quotePost.author.display_name),
      h('span', { class: 'quote-handle' }, `@${quotePost.author.username}`)
    ),
    quotePost.content ? h('p', { class: 'quote-text' }, richText(quotePost.content)) : null,
    quotePost.media?.type === 'image'
      ? h('img', { class: 'quote-media', src: quotePost.media.url, alt: '' })
      : null
  );
}

function insertAtCursor(field, text) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(text, start, end, 'end');
  field.focus({ preventScroll: true });
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

export function openComposer({ quotePost = null, initialMedia = null } = {}) {
  const max = state.config.max_post_length;
  const textarea = h('textarea', {
    class: 'composer-text',
    maxlength: max,
    rows: 3,
    placeholder: 'Quoi de neuf ?',
  });
  const counter = h('span', { class: 'composer-counter' }, `0/${max}`);
  const preview = h('div', { class: 'composer-preview' });
  const fileInput = h('input', { type: 'file', accept: 'image/*,video/*', hidden: true });

  let media = initialMedia ? { ...initialMedia } : null;
  let uploading = false;

  const submitBtn = h(
    'button',
    { class: 'btn-primary', type: 'button', disabled: true },
    icon('send', 18),
    h('span', null, 'Poster')
  );

  const sync = () => {
    counter.textContent = `${textarea.value.length}/${max}`;
    submitBtn.disabled = uploading || (!textarea.value.trim() && !media && !quotePost);
  };

  function renderPreview() {
    if (!media) {
      preview.replaceChildren();
      return;
    }

    const node =
      media.type === 'video'
        ? h('video', {
            class: 'composer-media',
            src: media.url,
            controls: true,
            playsInline: true,
            preload: 'none',
          })
        : h('img', { class: 'composer-media', src: media.url, alt: '', decoding: 'async' });

    const soundChip =
      media.type === 'video' && media.soundAuthor
        ? h(
            'span',
            { class: 'composer-sound' },
            icon('music', 14),
            ` Son de @${media.soundAuthor.username}`
          )
        : null;

    preview.replaceChildren(
      h(
        'div',
        { class: 'composer-media-wrap' },
        node,
        soundChip,
        h(
          'button',
          {
            class: 'media-remove',
            type: 'button',
            'aria-label': 'Retirer le média',
            onclick: () => {
              setMedia(null);
              fileInput.value = '';
            },
          },
          icon('close', 16)
        )
      )
    );
  }

  function setMedia(next) {
    media = next ? { ...next } : null;
    renderPreview();
    sync();
  }

  textarea.addEventListener('input', sync);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > state.config.max_upload_mb * 1024 * 1024) {
      toast(`Fichier trop lourd (max ${state.config.max_upload_mb} Mo).`, 'error');
      fileInput.value = '';
      return;
    }

    uploading = true;
    sync();

    const bar = h('i');
    const progress = h('div', { class: 'upload-progress' }, bar);
    preview.replaceChildren(h('div', { class: 'uploading' }, 'Envoi en cours…', progress));

    try {
      const result = await uploadFile(file, (ratio) => {
        bar.style.width = `${Math.max(2, Math.round(ratio * 100))}%`;
      });
      setMedia({ url: result.url, type: result.type });
    } catch (error) {
      toast(error.message, 'error');
      preview.replaceChildren();
      fileInput.value = '';
    } finally {
      uploading = false;
      sync();
    }
  });

  const cameraBtn = h(
    'button',
    {
      class: 'tool-btn',
      type: 'button',
      title: 'Filmer une vidéo avec la caméra',
      onclick: () =>
        openVideoRecorder({
          onDone: (recorded) => setMedia(recorded),
        }),
    },
    icon('camera', 18),
    h('span', null, 'Caméra')
  );

  const body = h(
    'div',
    { class: 'composer' },
    h(
      'div',
      { class: 'composer-top' },
      avatarEl(state.me, { size: 44 }),
      h('div', { class: 'composer-main' }, textarea, preview)
    ),
    quotePost ? quotePreview(quotePost) : null,
    h(
      'div',
      { class: 'composer-tools' },
      h(
        'button',
        {
          class: 'tool-btn',
          type: 'button',
          title: 'Ajouter une photo ou une vidéo',
          onclick: () => fileInput.click(),
        },
        icon('image', 18),
        h('span', null, 'Média')
      ),
      cameraBtn,
      h(
        'button',
        {
          class: 'tool-btn',
          type: 'button',
          title: 'Ajouter un hashtag (#)',
          onclick: () => insertAtCursor(textarea, '#'),
        },
        icon('hash', 18),
        h('span', null, 'Tag')
      ),
      fileInput,
      h(
        'span',
        { class: 'composer-ttl' },
        icon('clock', 15),
        ` Disparaît dans ${state.config.ttl_hours} h`
      ),
      h('div', { class: 'spacer' }),
      counter,
      submitBtn
    )
  );

  openModal(body, {
    title: quotePost ? 'Citer le post' : 'Nouveau post',
    className: 'modal--composer',
  });

  const submit = async () => {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    try {
      await post('/posts', {
        content: textarea.value.trim(),
        media_url: media?.url,
        media_type: media?.type,
        repost_of: quotePost?.id,
      });
      closeModal();
      toast(`Posté ! Il s’effacera dans ${state.config.ttl_hours} h.`, 'success');
      emit('refresh');
    } catch (error) {
      toast(error.message, 'error');
      submitBtn.disabled = false;
    } finally {
      submitBtn.classList.remove('is-loading');
    }
  };

  submitBtn.addEventListener('click', submit);
  textarea.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  if (media) renderPreview();
  sync();
  setTimeout(() => textarea.focus({ preventScroll: true }), 60);
}

/* ------------------------------------------------------------------ */
/* Feed + pages de hashtag                                            */
/* ------------------------------------------------------------------ */

const HOME_MODES = [
  { value: 'friends', label: 'Amis' },
  { value: 'all', label: 'Découvrir' },
  { value: 'top', label: 'Top' },
  { value: 'random', label: 'Au hasard' },
];

const TAG_MODES = [
  { value: 'recent', label: 'Récents' },
  { value: 'top', label: 'Top' },
  { value: 'random', label: 'Au hasard' },
];

function modeSort(mode) {
  return mode === 'top' || mode === 'random' ? mode : 'recent';
}

async function postsFeed(root, { title, back = false, tag = null } = {}) {
  const modes = tag ? TAG_MODES : HOME_MODES;
  const pageSize = state.lite ? 12 : 20;

  let mode = modes[0].value;
  if (!tag) {
    try {
      const stored = localStorage.getItem('rbp_feed_scope');
      if (modes.some((item) => item.value === stored)) mode = stored;
    } catch {
      // Stockage indisponible : on reste sur le feed d'amis.
    }
  }

  let cursor = null;
  let loading = false;
  let exhausted = false;

  const list = h('div', { class: 'post-list' });
  const sentinel = h('div', { class: 'sentinel' });
  const tabs = h('div', { class: 'tabs' });
  const trends = h('div', { class: 'tag-strip', hidden: true });

  const reshuffleBtn = h(
    'button',
    {
      class: 'btn-ghost btn-sm',
      type: 'button',
      title: 'Relancer le hasard',
      onclick: () => reset(),
    },
    icon('shuffle', 16),
    h('span', null, 'Relancer')
  );
  reshuffleBtn.hidden = mode !== 'random';

  const headActions = h('div', { class: 'row-end' });
  if (tag) {
    headActions.append(
      h(
        'a',
        {
          class: 'btn-ghost btn-sm',
          href: `#/scroll/tag/${encodeURIComponent(tag)}`,
          title: 'Voir les vidéos de ce thème en scroll',
        },
        icon('reels', 16),
        h('span', null, 'Scroll')
      )
    );
  }
  headActions.append(reshuffleBtn);

  const head = viewHead(title, { back, right: headActions });

  const tabEls = modes.map((item) =>
    h(
      'button',
      {
        class: `tab${mode === item.value ? ' is-active' : ''}`,
        type: 'button',
        dataset: { scope: item.value },
        onclick: () => switchMode(item.value),
      },
      item.label
    )
  );
  tabs.append(...tabEls);

  const teaser = tag
    ? null
    : h(
        'button',
        { class: 'composer-teaser', type: 'button', onclick: () => openComposer() },
        avatarEl(state.me, { size: 42 }),
        h('span', { class: 'composer-teaser-text' }, `Quoi de neuf, ${state.me.display_name} ?`),
        h('span', { class: 'composer-teaser-hint' }, icon('image', 18), icon('video', 18))
      );

  root.append(head, tabs);
  if (!tag) {
    root.append(trends, teaser);
  }
  root.append(list, sentinel);

  function emptyForMode() {
    if (tag) {
      return emptyState({
        iconName: 'hash',
        title: `Aucun post avec #${tag}`,
        text: 'Sois la première personne à publier sur ce thème.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => openComposer() },
            'Créer un post'
          ),
          h(
            'a',
            { class: 'btn-ghost', href: '#/' },
            'Retour à l’accueil'
          ),
        ],
      });
    }
    if (mode === 'friends') {
      return emptyState({
        iconName: 'users',
        title: 'Ton feed est vide',
        text: 'Ajoute des amis, ou va voir ce que publie tout le monde.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => switchMode('all') },
            'Découvrir'
          ),
          h(
            'button',
            { class: 'btn-ghost', type: 'button', onclick: () => go('friends') },
            'Trouver des amis'
          ),
        ],
      });
    }
    if (mode === 'top') {
      return emptyState({
        iconName: 'heart',
        title: 'Pas encore de posts aimés',
        text: 'Le classement se remplit dès que les posts reçoivent des cœurs.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => switchMode('all') },
            'Découvrir'
          ),
        ],
      });
    }
    if (mode === 'random') {
      return emptyState({
        iconName: 'shuffle',
        title: 'Rien à afficher au hasard',
        text: 'Il n’y a pas encore assez de posts. Réessaie dans un instant.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => reset() },
            'Relancer'
          ),
        ],
      });
    }
    return emptyState({
      iconName: 'sparkles',
      title: 'Personne n’a encore posté',
      text: 'Sois la première personne à publier… avant que ça disparaisse !',
      actions: [
        h(
          'button',
          { class: 'btn-primary', type: 'button', onclick: () => openComposer() },
          'Créer un post'
        ),
      ],
    });
  }

  async function load(first = false) {
    if (loading || (exhausted && !first)) return;
    loading = true;

    if (first) {
      list.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
    }

    try {
      const params = new URLSearchParams({
        scope: tag ? 'all' : mode === 'friends' ? 'friends' : 'all',
        limit: String(pageSize),
        sort: modeSort(mode),
      });
      if (tag) params.set('tag', tag);

      if (cursor) {
        if (cursor.offset !== undefined) {
          params.set('offset', String(cursor.offset));
        } else {
          params.set('before', cursor.before);
          params.set('before_id', cursor.before_id);
        }
      }

      const data = await get(`/posts?${params.toString()}`);

      if (first) list.replaceChildren();
      for (const postRow of data.posts) list.append(postCard(postRow));

      cursor = data.next;
      exhausted = !data.next;

      if (first && data.posts.length === 0) list.append(emptyForMode());
    } catch (error) {
      if (first) list.replaceChildren();
      toast(error.message, 'error');
      list.append(
        emptyState({
          iconName: 'clock',
          title: 'Impossible de charger le feed',
          text: error.message,
        })
      );
    } finally {
      loading = false;
    }
  }

  function reset() {
    cursor = null;
    exhausted = false;
    load(true);
  }

  function switchMode(value) {
    if (mode === value) return;
    mode = value;
    if (!tag) {
      state.feedScope = value;
      try {
        localStorage.setItem('rbp_feed_scope', value);
      } catch {
        // Stockage indisponible : le choix reste valable pour la session.
      }
    }
    for (const button of tabEls) {
      button.classList.toggle('is-active', button.dataset.scope === value);
    }
    reshuffleBtn.hidden = value !== 'random';
    reset();
  }

  if (!tag) {
    get('/posts/tags?limit=10')
      .then(({ tags }) => {
        if (!tags?.length || !trends.isConnected) return;
        trends.replaceChildren(
          h('span', { class: 'tag-strip-label' }, icon('hash', 14), 'Tendances'),
          ...tags.map(({ tag: trendTag, count }) =>
            h(
              'a',
              { class: 'tag-chip', href: `#/tag/${encodeURIComponent(trendTag)}` },
              `#${trendTag}`,
              h('span', { class: 'tag-chip-count' }, formatCount(count))
            )
          )
        );
        trends.hidden = false;
      })
      .catch(() => {
        // Les tendances sont un bonus : on ignore les erreurs.
      });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!sentinel.isConnected) {
        observer.disconnect();
        return;
      }
      if (entries.some((entry) => entry.isIntersecting)) load();
    },
    { rootMargin: '700px 0px' }
  );
  observer.observe(sentinel);

  await load(true);
}

export function feedView(root) {
  return postsFeed(root, { title: 'Accueil' });
}

export function tagView(root, rawTag) {
  const tag = normalizeTag(rawTag);
  if (!tag) {
    root.append(
      viewHead('Hashtag', { back: true }),
      emptyState({
        iconName: 'hash',
        title: 'Hashtag invalide',
        text: 'Ce lien ne correspond à aucun thème.',
        actions: [h('a', { class: 'btn-primary', href: '#/' }, 'Retour à l’accueil')],
      })
    );
    return undefined;
  }
  return postsFeed(root, { title: `#${tag}`, back: true, tag });
}

/* ------------------------------------------------------------------ */
/* Reels                                                              */
/* ------------------------------------------------------------------ */

const REELS_SOUND_KEY = 'rbp_reels_sound';

// Nombre de vidéos gardées « prêtes » autour de celle qui est à l'écran :
// 2 devant (pour que le swipe soit instantané) et 1 derrière.
const PRELOAD_AHEAD = 2;
const PRELOAD_BEHIND = 1;

let reelsMuted = (() => {
  try {
    return localStorage.getItem(REELS_SOUND_KEY) !== 'on';
  } catch {
    return true;
  }
})();

// Une seule vidéo du scroll peut porter le son. Toutes les autres sont
// muettes et en pause, sinon les bandes-son se superposent.
let activeReelVideo = null;

function persistReelsSound() {
  try {
    localStorage.setItem(REELS_SOUND_KEY, reelsMuted ? 'off' : 'on');
  } catch {
    // Stockage indisponible : le choix reste valable pour la session.
  }
}

function applyReelsSoundUi() {
  for (const button of document.querySelectorAll('.reel-mute')) {
    button.replaceChildren(icon(reelsMuted ? 'mute' : 'sound', 24));
  }
  const hint = document.querySelector('.reels-hint');
  if (hint) {
    hint.textContent = `Swipe pour découvrir · ${reelsMuted ? 'son coupé' : 'son activé'}`;
  }
}

/** Donne l'exclusivité du son à une vidéo et coupe toutes les autres. */
function claimReelVideo(video) {
  for (const other of document.querySelectorAll('.reel-video')) {
    if (other === video) continue;
    if (!other.paused) other.pause();
    other.muted = true;
  }
  activeReelVideo = video;
  video.muted = reelsMuted;
}

/** Lance une vidéo ; si le navigateur refuse le son automatique, on la muet. */
async function playReelVideo(video) {
  if (!video) return;
  claimReelVideo(video);

  try {
    await video.play();
  } catch {
    if (video.muted) return;
    reelsMuted = true;
    persistReelsSound();
    video.muted = true;
    applyReelsSoundUi();
    video.play().catch(() => {});
  }
}

function toggleReelsMuted() {
  reelsMuted = !reelsMuted;
  persistReelsSound();
  for (const video of document.querySelectorAll('.reel-video')) {
    const isActive = video === activeReelVideo && !video.paused;
    video.muted = isActive ? reelsMuted : true;
  }
  applyReelsSoundUi();
}

function reelSlide(postRow) {
  const video = h('video', {
    class: 'reel-video',
    dataset: { src: postRow.media.url },
    loop: true,
    playsInline: true,
    preload: 'none',
  });
  video.muted = true;

  // Garde-fou : dès qu'une vidéo démarre, les autres se mettent en pause.
  video.addEventListener('play', () => claimReelVideo(video));

  video.addEventListener('click', () => {
    if (video.paused) playReelVideo(video);
    else video.pause();
  });

  const likeBtn = h(
    'button',
    {
      class: 'reel-action reel-like' + (postRow.liked ? ' liked' : ''),
      type: 'button',
      'aria-label': 'J’aime',
      onclick: async () => {
        try {
          const result = await post(`/posts/${postRow.id}/like`);
          postRow.liked = result.liked;
          postRow.counts.likes = result.count;
          likeBtn.classList.toggle('liked', result.liked);
          likeBtn.querySelector('span').textContent = formatCount(result.count);
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    },
    icon('heart', 27),
    h('span', null, formatCount(postRow.counts.likes))
  );

  return h(
    'section',
    { class: 'reel', dataset: { id: postRow.id } },
    video,
    h('div', { class: 'reel-shade' }),
    h(
      'div',
      { class: 'reel-actions' },
      likeBtn,
      h(
        'button',
        {
          class: 'reel-action',
          type: 'button',
          'aria-label': 'Commenter',
          onclick: () => go(`post/${postRow.id}`),
        },
        icon('comment', 26),
        h('span', null, formatCount(postRow.counts.comments))
      ),
      h(
        'button',
        {
          class: 'reel-action',
          type: 'button',
          'aria-label': 'Republier',
          onclick: () => openRepostMenu(postRow),
        },
        icon('repost', 26),
        h('span', null, formatCount(postRow.counts.reposts))
      ),
      h(
        'button',
        {
          class: 'reel-action',
          type: 'button',
          title: 'Filmer une vidéo avec ce son',
          'aria-label': 'Utiliser ce son',
          onclick: () => recordWithSound(postRow),
        },
        icon('music', 24),
        h('span', null, 'Son')
      ),
      h(
        'button',
        {
          class: 'reel-action reel-mute',
          type: 'button',
          'aria-label': 'Couper ou activer le son',
          onclick: toggleReelsMuted,
        },
        icon(reelsMuted ? 'mute' : 'sound', 24)
      )
    ),
    h(
      'div',
      { class: 'reel-info' },
      h(
        'div',
        { class: 'reel-author-row' },
        h(
          'a',
          { class: 'reel-author', href: `#/u/${postRow.author.username}` },
          avatarEl(postRow.author, { size: 38 }),
          h(
            'div',
            null,
            h('b', null, postRow.author.display_name),
            h('span', null, `@${postRow.author.username}`)
          )
        ),
        quickSocialActions(postRow.author, { className: 'reel-quick' })
      ),
      postRow.content ? h('p', { class: 'reel-text' }, richText(postRow.content)) : null,
      h(
        'span',
        { class: 'expiry', dataset: { expires: postRow.expires_at } },
        `⏳ ${remaining(postRow.expires_at)}`
      )
    )
  );
}

export async function reelsView(root, rawTag = null) {
  root.classList.add('view--reels');

  const tag = rawTag ? normalizeTag(rawTag) : null;
  if (rawTag && !tag) {
    root.append(
      viewHead('Hashtag', { back: true }),
      emptyState({
        iconName: 'hash',
        title: 'Hashtag invalide',
        text: 'Ce lien ne correspond à aucun thème.',
        actions: [h('a', { class: 'btn-primary', href: '#/scroll' }, 'Voir tous les scrolls')],
      })
    );
    return;
  }

  let posts;
  try {
    const limit = state.lite ? 12 : 30;
    const query = `/posts/reels?limit=${limit}` + (tag ? `&tag=${encodeURIComponent(tag)}` : '');
    ({ posts } = await get(query));
  } catch (error) {
    toast(error.message, 'error');
    posts = [];
  }

  if (!posts.length) {
    root.append(
      viewHead(tag ? `#${tag}` : 'Scroll', { back: Boolean(tag) }),
      emptyState({
        iconName: 'video',
        title: tag ? `Aucune vidéo avec #${tag}` : 'Aucune vidéo pour le moment',
        text: tag
          ? 'Les vidéos de ce thème apparaîtront ici dès qu’elles seront publiées.'
          : 'Poste une vidéo et elle apparaîtra ici, dans le scroll vertical.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => openComposer() },
            'Poster une vidéo'
          ),
          tag
            ? h('a', { class: 'btn-ghost', href: `#/tag/${encodeURIComponent(tag)}` }, 'Voir les posts')
            : null,
        ].filter(Boolean),
      })
    );
    return;
  }

  const container = h('div', { class: 'reels' });

  const hint = h(
    'div',
    { class: 'reels-hint' },
    `Swipe pour découvrir · ${reelsMuted ? 'son coupé' : 'son activé'}`
  );

  // Seules la vidéo courante, les 2 suivantes et la précédente gardent une
  // source. Tout le reste est libéré : pas de préchargement des 30 vidéos.
  const loadReelVideo = (video, preload) => {
    if (video.preload !== preload) video.preload = preload;
    if (!video.getAttribute('src') && video.dataset.src) {
      video.src = video.dataset.src;
    }
  };

  const releaseReelVideo = (video) => {
    if (!video.paused) video.pause();
    video.muted = true;
    video.preload = 'none';
    if (video.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
    if (activeReelVideo === video) activeReelVideo = null;
  };

  let slides = [];
  let activeIndex = -1;
  let frame = 0;

  const currentIndex = () => {
    const height = container.clientHeight || 1;
    const raw = Math.round(container.scrollTop / height);
    return Math.max(0, Math.min(slides.length - 1, raw));
  };

  function updateWindow({ force = false } = {}) {
    if (!slides.length) return;

    const index = currentIndex();
    if (!force && index === activeIndex) return;

    const previous = slides[activeIndex]?.video;
    activeIndex = index;

    slides.forEach(({ video }, position) => {
      const distance = position - index;
      if (distance >= -PRELOAD_BEHIND && distance <= PRELOAD_AHEAD) {
        loadReelVideo(video, distance === 0 ? 'auto' : 'metadata');
      } else {
        releaseReelVideo(video);
      }
    });

    if (previous && previous !== slides[index]?.video) {
      previous.pause();
      previous.muted = true;
    }

    const active = slides[index]?.video;
    if (active) playReelVideo(active);
  }

  const onScroll = () => {
    if (!container.isConnected) {
      container.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      return;
    }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateWindow();
    });
  };

  const onVisibility = () => {
    if (!container.isConnected) {
      document.removeEventListener('visibilitychange', onVisibility);
      return;
    }
    if (document.hidden) {
      for (const { video } of slides) video.pause();
      activeReelVideo = null;
    } else {
      updateWindow({ force: true });
    }
  };

  container.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  function renderSlides() {
    for (const { video } of slides) releaseReelVideo(video);
    slides = [];
    activeIndex = -1;

    container.replaceChildren(...posts.map(reelSlide));
    slides = Array.from(container.children).map((section) => ({
      section,
      video: section.querySelector('video'),
    }));

    container.scrollTop = 0;
    updateWindow({ force: true });
  }

  function shuffleReels() {
    for (let index = posts.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [posts[index], posts[swap]] = [posts[swap], posts[index]];
    }
    renderSlides();
    toast('Vidéos mélangées.', 'info');
  }

  const shuffleBtn = h(
    'button',
    {
      class: 'btn-ghost btn-sm reels-shuffle',
      type: 'button',
      title: 'Mélanger les vidéos',
      onclick: shuffleReels,
    },
    icon('shuffle', 16),
    h('span', null, 'Mélanger')
  );

  const headActions = h('div', { class: 'row-end' });
  if (tag) {
    headActions.append(
      h(
        'a',
        {
          class: 'btn-ghost btn-sm',
          href: `#/tag/${encodeURIComponent(tag)}`,
          title: 'Voir les posts de ce thème',
        },
        icon('hash', 16),
        h('span', null, 'Posts')
      )
    );
  }
  headActions.append(shuffleBtn);

  root.append(
    viewHead(tag ? `#${tag}` : 'Scroll', { back: Boolean(tag), right: headActions }),
    container,
    hint
  );
  renderSlides();
}

/* ------------------------------------------------------------------ */
/* Détail d'un post + commentaires                                    */
/* ------------------------------------------------------------------ */

function commentEl(comment, onDelete) {
  return h(
    'article',
    { class: 'comment' },
    avatarEl(comment.author, { size: 36 }),
    h(
      'div',
      { class: 'comment-main' },
      h(
        'div',
        { class: 'comment-head' },
        h('a', { class: 'post-name', href: `#/u/${comment.author.username}` }, comment.author.display_name),
        h('span', { class: 'post-handle' }, `@${comment.author.username}`),
        h('span', { class: 'post-dot' }, '·'),
        h('span', { class: 'comment-time' }, timeAgo(comment.created_at))
      ),
      h('p', { class: 'comment-text' }, richText(comment.content))
    ),
    comment.author.id === state.me.id
      ? h(
          'button',
          {
            class: 'icon-btn danger',
            type: 'button',
            title: 'Supprimer ce commentaire',
            onclick: onDelete,
          },
          icon('trash', 16)
        )
      : null
  );
}

export async function postDetailView(root, id) {
  root.append(viewHead('Post', { back: true }));

  const holder = h('div', { class: 'post-detail' });
  root.append(holder);

  let postRow;
  try {
    ({ post: postRow } = await get(`/posts/${id}`));
  } catch (error) {
    holder.append(
      emptyState({
        iconName: 'clock',
        title: 'Post introuvable',
        text: error.message,
        actions: [
          h('button', { class: 'btn-primary', type: 'button', onclick: () => go('') }, 'Retour à l’accueil'),
        ],
      })
    );
    return;
  }

  const card = postCard(postRow, { detail: true });
  holder.append(card);

  const list = h('div', { class: 'comment-list' });
  const input = h('input', {
    class: 'comment-input',
    placeholder: 'Répondre…',
    maxlength: state.config.max_comment_length,
  });
  const sendBtn = h(
    'button',
    { class: 'icon-btn send-btn', type: 'submit', disabled: true, 'aria-label': 'Envoyer' },
    icon('send', 20)
  );

  const form = h(
    'form',
    {
      class: 'comment-form',
      onsubmit: async (event) => {
        event.preventDefault();
        await sendComment();
      },
    },
    avatarEl(state.me, { size: 38 }),
    input,
    sendBtn
  );

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
  });

  holder.append(
    h(
      'section',
      { class: 'comments' },
      h('h2', { class: 'comments-title' }, 'Commentaires'),
      form,
      list
    )
  );

  let comments = [];

  function renderComments() {
    list.replaceChildren();
    if (!comments.length) {
      list.append(h('p', { class: 'muted small' }, 'Aucun commentaire pour le moment.'));
      return;
    }
    for (const comment of comments) {
      list.append(
        commentEl(comment, async () => {
          const confirmed = await confirmDialog({
            title: 'Supprimer ce commentaire ?',
            message: 'Il disparaîtra immédiatement.',
            confirmLabel: 'Supprimer',
            danger: true,
          });
          if (!confirmed) return;
          try {
            await del(`/posts/comments/${comment.id}`);
            comments = comments.filter((item) => item.id !== comment.id);
            renderComments();
            syncCommentCount();
          } catch (error) {
            toast(error.message, 'error');
          }
        })
      );
    }
  }

  function syncCommentCount() {
    const counter = card.querySelector('[data-role="comments"]');
    if (counter) counter.textContent = formatCount(comments.length);
  }

  try {
    ({ comments } = await get(`/posts/${id}/comments`));
  } catch {
    comments = [];
  }
  renderComments();
  syncCommentCount();

  async function sendComment() {
    const content = input.value.trim();
    if (!content) return;

    sendBtn.disabled = true;
    try {
      const result = await post(`/posts/${id}/comments`, { content });
      comments.push(result.comment);
      input.value = '';
      renderComments();
      syncCommentCount();
    } catch (error) {
      toast(error.message, 'error');
      sendBtn.disabled = false;
    }
  }
}
