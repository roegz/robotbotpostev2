import { post } from './api.js';
import { state, emit } from './state.js';
import { h } from './ui.js';
import { brandMark } from './icons.js';

export function renderAuth(root) {
  let mode = location.hash === '#/register' ? 'register' : 'login';

  const errorEl = h('p', { class: 'form-error', hidden: true });
  const formZone = h('div', { class: 'auth-form-zone' });
  const tabs = h('div', { class: 'auth-tabs' });
  let selectedAvatar = '🤖';

  const screen = h(
    'div',
    { class: 'auth' },
    h('div', { class: 'auth-glow auth-glow--one' }),
    h('div', { class: 'auth-glow auth-glow--two' }),
    h(
      'div',
      { class: 'auth-card' },
      h(
        'div',
        { class: 'auth-brand' },
        brandMark(48),
        h('div', null, h('h1', null, 'robotbotposte'), h('p', { class: 'auth-brand-sub' }, 'v1.0 · éphémère'))
      ),
      h(
        'p',
        { class: 'auth-tagline' },
        'Le réseau social qui s’efface. Posts, vidéos et messages disparaissent ',
        h('b', null, `${state.config.ttl_hours} h`),
        ' après leur publication.'
      ),
      tabs,
      formZone,
      errorEl,
      h(
        'p',
        { class: 'auth-foot' },
        'Ici, rien ne reste pour toujours. Profite du moment. 🦾'
      )
    )
  );

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function tabButton(label, value) {
    return h(
      'button',
      {
        class: `auth-tab${mode === value ? ' is-active' : ''}`,
        type: 'button',
        onclick: () => {
          mode = value;
          render();
        },
      },
      label
    );
  }

  function loginForm() {
    const username = h('input', {
      class: 'field',
      placeholder: 'pseudo',
      autocomplete: 'username',
      required: true,
      spellcheck: false,
    });
    const password = h('input', {
      class: 'field',
      type: 'password',
      placeholder: 'mot de passe',
      autocomplete: 'current-password',
      required: true,
    });
    const submit = h('button', { class: 'btn-primary auth-submit', type: 'submit' }, 'Se connecter');

    return h(
      'form',
      {
        class: 'auth-form',
        onsubmit: async (event) => {
          event.preventDefault();
          submit.disabled = true;
          try {
            const result = await post('/auth/login', {
              username: username.value.trim().toLowerCase(),
              password: password.value,
            });
            state.me = result.user;
            emit('auth:success');
          } catch (error) {
            showError(error.message);
            submit.disabled = false;
          }
        },
      },
      h('label', null, 'Pseudo', username),
      h('label', null, 'Mot de passe', password),
      submit
    );
  }

  function registerForm() {
    const displayName = h('input', {
      class: 'field',
      placeholder: 'Ton nom affiché',
      maxlength: 40,
      required: true,
    });
    const username = h('input', {
      class: 'field',
      placeholder: 'pseudo (3-20, a-z 0-9 _)',
      autocomplete: 'username',
      maxlength: 20,
      required: true,
      spellcheck: false,
    });
    const password = h('input', {
      class: 'field',
      type: 'password',
      placeholder: 'mot de passe (6 caractères min.)',
      autocomplete: 'new-password',
      minlength: 6,
      required: true,
    });

    const avatarGrid = h('div', { class: 'avatar-grid avatar-grid--auth' });
    for (const emoji of state.config.avatars) {
      avatarGrid.append(
        h(
          'button',
          {
            class: `avatar-choice${emoji === selectedAvatar ? ' is-active' : ''}`,
            type: 'button',
            'aria-label': `Avatar ${emoji}`,
            onclick: () => {
              selectedAvatar = emoji;
              for (const child of avatarGrid.children) {
                child.classList.toggle('is-active', child.textContent === emoji);
              }
            },
          },
          emoji
        )
      );
    }

    const submit = h(
      'button',
      { class: 'btn-primary auth-submit', type: 'submit' },
      'Créer mon compte'
    );

    return h(
      'form',
      {
        class: 'auth-form',
        onsubmit: async (event) => {
          event.preventDefault();
          submit.disabled = true;
          try {
            const result = await post('/auth/register', {
              username: username.value.trim().toLowerCase(),
              display_name: displayName.value.trim(),
              password: password.value,
              avatar: selectedAvatar,
            });
            state.me = result.user;
            emit('auth:success');
          } catch (error) {
            showError(error.message);
            submit.disabled = false;
          }
        },
      },
      h('label', null, 'Nom affiché', displayName),
      h('label', null, 'Pseudo', username),
      h('label', null, 'Mot de passe', password),
      h('div', { class: 'form-label' }, 'Choisis ton avatar'),
      avatarGrid,
      submit
    );
  }

  function render() {
    tabs.replaceChildren(tabButton('Connexion', 'login'), tabButton('Inscription', 'register'));
    errorEl.hidden = true;
    formZone.replaceChildren(mode === 'login' ? loginForm() : registerForm());
  }

  root.replaceChildren(screen);
  render();
}
