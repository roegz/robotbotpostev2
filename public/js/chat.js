import { get, post } from './api.js';
import { state, go, emit, on } from './state.js';
import { h, avatarEl, toast, emptyState, viewHead } from './ui.js';
import { icon } from './icons.js';
import { openNewMessageDialog } from './relations.js';

function conversationRow(conversation) {
  return h(
    'a',
    {
      class: `convo${conversation.unread ? ' has-unread' : ''}`,
      href: `#/messages/${conversation.user.username}`,
    },
    avatarEl(conversation.user, { size: 46 }),
    h(
      'div',
      { class: 'convo-body' },
      h(
        'div',
        { class: 'convo-top' },
        h('b', null, conversation.user.display_name),
        h('span', { class: 'convo-time' }, shortTime(conversation.last.created_at))
      ),
      h(
        'p',
        { class: 'convo-preview' },
        conversation.last.from_me ? 'Toi : ' : '',
        conversation.last.content
      )
    ),
    conversation.unread
      ? h('span', { class: 'convo-badge' }, conversation.unread > 9 ? '9+' : conversation.unread)
      : null
  );
}

function shortTime(iso) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export async function chatView(root, username) {
  root.classList.add('view--chat');

  const layout = h('div', { class: `chat${username ? ' thread-open' : ''}` });
  const listPane = h('aside', { class: 'chat-list' });
  const threadPane = h('section', { class: 'chat-thread' });
  layout.append(listPane, threadPane);
  root.append(layout);

  let conversations = [];
  try {
    ({ conversations } = await get('/messages'));
  } catch (error) {
    toast(error.message, 'error');
  }

  listPane.append(
    h(
      'div',
      { class: 'chat-list-head' },
      h('h2', null, 'Messages'),
      h(
        'div',
        { class: 'chat-list-actions' },
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            title: 'Nouveau message',
            'aria-label': 'Nouveau message',
            onclick: () => openNewMessageDialog(),
          },
          icon('edit', 18)
        ),
        h('span', { class: 'pill' }, `${state.config.ttl_hours} h`)
      )
    ),
    conversations.length
      ? h('div', { class: 'convos' }, ...conversations.map(conversationRow))
      : h(
          'p',
          { class: 'muted small pad' },
          'Aucune conversation pour le moment. Utilise le bouton ✎ pour écrire à quelqu’un.'
        )
  );

  if (!username) {
    threadPane.append(
      emptyState({
        iconName: 'chat',
        title: 'Choisis une conversation',
        text: `Chaque message disparaît ${state.config.ttl_hours} h après son envoi.`,
      })
    );
    emit('unread:refresh');
    return;
  }

  await openThread(threadPane, username);
  emit('unread:refresh');
}

async function openThread(threadPane, username) {
  let data;
  try {
    data = await get(`/messages/${encodeURIComponent(username)}`);
  } catch (error) {
    threadPane.append(
      emptyState({
        iconName: 'chat',
        title: 'Conversation indisponible',
        text: error.message,
        actions: [
          h(
            'button',
            { class: 'btn-primary', type: 'button', onclick: () => go('messages') },
            'Retour aux messages'
          ),
        ],
      })
    );
    return;
  }

  const other = data.user;
  const messages = [...data.messages];

  const messagesEl = h('div', { class: 'chat-messages' });
  const typingEl = h('div', { class: 'typing', hidden: true });
  const input = h('input', {
    class: 'chat-input',
    placeholder: `Message à @${other.username}…`,
    maxlength: state.config.max_message_length,
    autocomplete: 'off',
  });
  const sendBtn = h(
    'button',
    { class: 'send-btn', type: 'submit', disabled: true, 'aria-label': 'Envoyer' },
    icon('send', 20)
  );

  const form = h(
    'form',
    {
      class: 'chat-form',
      onsubmit: async (event) => {
        event.preventDefault();
        await send();
      },
    },
    input,
    sendBtn
  );

  threadPane.replaceChildren(
    h(
      'header',
      { class: 'chat-head' },
      h(
        'a',
        { class: 'icon-btn chat-back', href: '#/messages', 'aria-label': 'Retour aux messages' },
        icon('back', 20)
      ),
      h(
        'a',
        { class: 'chat-head-user', href: `#/u/${other.username}` },
        avatarEl(other, { size: 38 }),
        h(
          'div',
          { class: 'chat-head-names' },
          h('b', null, other.display_name),
          h('span', null, `@${other.username}`)
        )
      ),
      h('span', { class: 'pill pill--ghost' }, icon('clock', 14), `${state.config.ttl_hours} h`)
    ),
    h(
      'div',
      { class: 'chat-notice' },
      `⌛ Ces messages s’effacent ${state.config.ttl_hours} h après leur envoi.`
    ),
    messagesEl,
    typingEl,
    form
  );

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function appendMessage(message) {
    if (messagesEl.querySelector(`[data-mid="${message.id}"]`)) return;

    const mine = message.sender_id === state.me.id;
    const bubble = h(
      'div',
      {
        class: `bubble ${mine ? 'bubble--mine' : 'bubble--theirs'}`,
        dataset: { mid: message.id },
        title: `Disparaît ${new Date(message.expires_at).toLocaleString('fr-FR')}`,
      },
      h('p', null, message.content),
      h(
        'span',
        { class: 'bubble-time' },
        new Date(message.created_at).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      )
    );

    messagesEl.append(bubble);
    scrollToBottom();
  }

  for (const message of messages) appendMessage(message);
  scrollToBottom();

  function updateSend() {
    sendBtn.disabled = !input.value.trim();
  }

  input.addEventListener('input', () => {
    updateSend();

    if (!state.socket?.connected) return;
    const now = Date.now();
    if (now - input._lastTyping > 1500) {
      input._lastTyping = now;
      state.socket.emit('dm:typing', { to: other.id });
    }
  });
  input._lastTyping = 0;

  async function send() {
    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    updateSend();

    const socket = state.socket;
    if (socket?.connected) {
      socket.emit('dm:send', { to: username, content }, (response) => {
        if (!response?.ok) {
          toast(response?.error || 'Envoi impossible.', 'error');
          input.value = content;
          updateSend();
          return;
        }
        appendMessage(response.message);
      });
      return;
    }

    try {
      const result = await post(`/messages/${encodeURIComponent(username)}`, { content });
      appendMessage(result.message);
    } catch (error) {
      toast(error.message, 'error');
      input.value = content;
      updateSend();
    }
  }

  const offDm = on('dm', ({ message, other: peer }) => {
    if (!messagesEl.isConnected) {
      offDm();
      return;
    }
    if (peer?.username !== username) return;
    appendMessage(message);
  });

  let typingTimer = null;
  const offTyping = on('typing', (payload) => {
    if (!typingEl.isConnected) {
      offTyping();
      return;
    }
    if (payload.fromId !== other.id) return;

    typingEl.hidden = false;
    typingEl.textContent = `${other.display_name} écrit…`;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingEl.hidden = true;
    }, 2500);
  });

  setTimeout(() => input.focus({ preventScroll: true }), 80);
}
