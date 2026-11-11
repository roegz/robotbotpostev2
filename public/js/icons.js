const PATHS = {
  home: '<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
  reels:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-7.2A8.5 8.5 0 1 1 21 11.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.2 8-6.2S20 17 20 21"/>',
  users:
    '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.4 3-5.3 6.5-5.3s6.5 1.9 6.5 5.3"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.4"/><path d="M18 14.9c2.2.6 3.5 2.2 3.5 4.4"/>',
  heart:
    '<path d="M12 20.4S3.8 15.5 3.8 9.6A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.2 3.3c0 5.9-8.2 10.8-8.2 10.8z"/>',
  comment: '<path d="M4 4.5h16v11.5H8.5L4 20z"/>',
  repost:
    '<path d="M7 7h10l-3.2-3.2"/><path d="M17 7v6"/><path d="M17 17H7l3.2 3.2"/><path d="M7 17v-6"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 2.5-2.5L20 18"/>',
  video:
    '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
  send: '<path d="m4 12 16-8-6 8 6 8z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  check: '<path d="m5 12 5 5L19 7"/>',
  logout:
    '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 9 4 6M21 9l-4 6"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 2.5 4.2 5.5 4.2 9s-1.4 6.5-4.2 9c-2.8-2.5-4.2-5.5-4.2-9S9.2 5.5 12 3z"/>',
  lock:
    '<rect x="4" y="10" width="16" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkles:
    '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  userPlus:
    '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.4 3-5.3 6.5-5.3s6.5 1.9 6.5 5.3"/><path d="M18.5 8v6M15.5 11h6"/>',
  music:
    '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  shuffle:
    '<path d="M16 4h4v4"/><path d="M4 20 20 4"/><path d="M16 20h4v-4"/><path d="m4 4 4.5 4.5"/><path d="m14 14 6 6"/>',
  camera:
    '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  flip:
    '<path d="M4 8a8 8 0 0 1 13.5-2.5L20 8"/><path d="M20 4v4h-4"/><path d="M20 16a8 8 0 0 1-13.5 2.5L4 16"/><path d="M4 20v-4h4"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  hash: '<path d="M10 3 8 21M16 3l-2 18"/><path d="M3.5 9h17M3 15h17"/>',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name] ?? '';
  return svg;
}

let gradientCount = 0;

/** Le petit robot, mascotte de robotbotposte. */
export function brandMark(size = 34) {
  const id = `rbp-grad-${++gradientCount}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7c5cff"/>
        <stop offset="1" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <rect x="4" y="8" width="40" height="33" rx="11" fill="url(#${id})"/>
    <rect x="13.5" y="18" width="8" height="8" rx="3" fill="#05060d"/>
    <rect x="26.5" y="18" width="8" height="8" rx="3" fill="#05060d"/>
    <path d="M17.5 31h13" stroke="#05060d" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M24 8V4" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/>
    <circle cx="24" cy="3.5" r="2.2" fill="#ff4fd8"/>
  `;
  return svg;
}
