import { get, post, del, uploadFile } from './api.js';
import { state, go, emit } from './state.js';
import {
  h,
  avatarEl,
  richText,
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

/* ------------------------------------------------------------------ */
/* Médias                                                              */
/* ------------------------------------------------------------------ */

function mediaEl(media) {
  if (media.type === 'video') {
    return h('video', {
      class: 'post-media',
      src: media.url,
      controls: true,
      playsInline: true,
      preload: 'metadata',
    });
  }

  const image = h('img', {
    class: 'post-media',
    src: media.url,
    alt: '',
    loading: 'lazy',
  });
  image.addEventListener('click', () => openLightbox(media.url));
  return image;
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
            onclick: () => openLightbox(quote.media.url),
          })
        : h('video', {
            class: 'quote-media',
            src: quote.media.url,
            controls: true,
            playsInline: true,
            preload: 'metadata',
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
          )
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

  return h(
    'div',
    { class: 'post-actions' },
    likeBtn,
    commentBtn,
    repostBtn,
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

export function openComposer({ quotePost = null } = {}) {
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

  let media = null;
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
      media = { url: result.url, type: result.type };

      const node =
        media.type === 'video'
          ? h('video', {
              class: 'composer-media',
              src: media.url,
              controls: true,
              playsInline: true,
              preload: 'metadata',
            })
          : h('img', { class: 'composer-media', src: media.url, alt: '' });

      preview.replaceChildren(
        h(
          'div',
          { class: 'composer-media-wrap' },
          node,
          h(
            'button',
            {
              class: 'media-remove',
              type: 'button',
              'aria-label': 'Retirer le média',
              onclick: () => {
                media = null;
                preview.replaceChildren();
                fileInput.value = '';
                sync();
              },
            },
            icon('close', 16)
          )
        )
      );
    } catch (error) {
      toast(error.message, 'error');
      preview.replaceChildren();
      fileInput.value = '';
    } finally {
      uploading = false;
      sync();
    }
  });

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

  sync();
  setTimeout(() => textarea.focus(), 60);
}

/* ------------------------------------------------------------------ */
/* Feed                                                               */
/* ------------------------------------------------------------------ */

export async function feedView(root) {
  let scope = state.feedScope;
  let cursor = null;
  let loading = false;
  let exhausted = false;

  const list = h('div', { class: 'post-list' });
  const sentinel = h('div', { class: 'sentinel' });
  const tabs = h('div', { class: 'tabs' });

  const tabFor = (label, value) =>
    h(
      'button',
      {
        class: `tab${scope === value ? ' is-active' : ''}`,
        type: 'button',
        dataset: { scope: value },
        onclick: () => switchScope(value),
      },
      label
    );

  tabs.append(tabFor('Amis', 'friends'), tabFor('Découvrir', 'all'));

  const teaser = h(
    'button',
    { class: 'composer-teaser', type: 'button', onclick: () => openComposer() },
    avatarEl(state.me, { size: 42 }),
    h('span', { class: 'composer-teaser-text' }, `Quoi de neuf, ${state.me.display_name} ?`),
    h('span', { class: 'composer-teaser-hint' }, icon('image', 18), icon('video', 18))
  );

  root.append(viewHead('Accueil'), tabs, teaser, list, sentinel);

  function emptyForScope() {
    if (scope === 'friends') {
      return emptyState({
        iconName: 'users',
        title: 'Ton feed est vide',
        text: 'Ajoute des amis, ou va voir ce que publie tout le monde.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => switchScope('all') },
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
      const query =
        `/posts?scope=${scope}&limit=20` +
        (cursor
          ? `&before=${encodeURIComponent(cursor.before)}&before_id=${encodeURIComponent(cursor.before_id)}`
          : '');
      const data = await get(query);

      if (first) list.replaceChildren();
      for (const postRow of data.posts) list.append(postCard(postRow));

      cursor = data.next;
      exhausted = !data.next;

      if (first && data.posts.length === 0) list.append(emptyForScope());
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

  function switchScope(value) {
    if (scope === value) return;
    scope = value;
    state.feedScope = value;
    localStorage.setItem('rbp_feed_scope', value);
    for (const button of tabs.querySelectorAll('.tab')) {
      button.classList.toggle('is-active', button.dataset.scope === value);
    }
    reset();
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

/* ------------------------------------------------------------------ */
/* Reels                                                              */
/* ------------------------------------------------------------------ */

let reelsMuted = true;

function toggleReelsMuted() {
  reelsMuted = !reelsMuted;
  for (const video of document.querySelectorAll('.reel-video')) {
    video.muted = reelsMuted;
  }
  for (const button of document.querySelectorAll('.reel-mute')) {
    button.replaceChildren(icon(reelsMuted ? 'mute' : 'sound', 24));
  }
  const hint = document.querySelector('.reels-hint');
  if (hint) hint.textContent = `Swipe pour découvrir · ${reelsMuted ? 'son coupé' : 'son activé'}`;
}

function reelSlide(postRow) {
  const video = h('video', {
    class: 'reel-video',
    src: postRow.media.url,
    loop: true,
    playsInline: true,
    preload: 'metadata',
  });
  video.muted = reelsMuted;
  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
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
      postRow.content ? h('p', { class: 'reel-text' }, richText(postRow.content)) : null,
      h(
        'span',
        { class: 'expiry', dataset: { expires: postRow.expires_at } },
        `⏳ ${remaining(postRow.expires_at)}`
      )
    )
  );
}

export async function reelsView(root) {
  root.classList.add('view--reels');

  let posts;
  try {
    ({ posts } = await get('/posts/reels?limit=30'));
  } catch (error) {
    toast(error.message, 'error');
    posts = [];
  }

  root.append(viewHead('Scroll'));

  if (!posts.length) {
    root.append(
      emptyState({
        iconName: 'video',
        title: 'Aucune vidéo pour le moment',
        text: 'Poste une vidéo et elle apparaîtra ici, dans le scroll vertical.',
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => openComposer() },
            'Poster une vidéo'
          ),
        ],
      })
    );
    return;
  }

  const container = h('div', { class: 'reels' });
  for (const postRow of posts) container.append(reelSlide(postRow));

  const hint = h(
    'div',
    { class: 'reels-hint' },
    `Swipe pour découvrir · ${reelsMuted ? 'son coupé' : 'son activé'}`
  );

  root.append(container, hint);

  const observer = new IntersectionObserver(
    (entries) => {
      if (!container.isConnected) {
        observer.disconnect();
        return;
      }
      for (const entry of entries) {
        const video = entry.target.querySelector('video');
        if (!video) continue;
        if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
          video.muted = reelsMuted;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    },
    { threshold: [0, 0.55, 1] }
  );

  for (const slide of container.children) observer.observe(slide);
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
      list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      toast(error.message, 'error');
      sendBtn.disabled = false;
    }
  }
}
