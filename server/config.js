import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..');
export const SERVER_DIR = here;
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(ROOT, process.env.UPLOAD_DIR)
  : path.join(ROOT, 'uploads');

export const IS_PROD = process.env.NODE_ENV === 'production';
export const APP_NAME = 'robotbotposte';

/** Durée de vie des posts / commentaires / messages (en heures). */
export const TTL_HOURS = Math.min(168, Math.max(1, Number(process.env.POST_TTL_HOURS) || 12));

/** Taille maximale d'un upload (en Mo). */
export const MAX_UPLOAD_MB = Math.min(200, Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 40));

export const ALLOWED_AVATARS = [
  '🤖', '👾', '🦾', '🛸', '💠', '🌀', '⚡', '🔥', '🌟', '🎧',
  '🎮', '🚀', '🪐', '🧿', '🐙', '👽', '🦿', '🎛️', '📡', '🛰️',
];

export const MAX_POST_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 300;
export const MAX_MESSAGE_LENGTH = 1000;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
