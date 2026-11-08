import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { IS_PROD } from './config.js';

export const COOKIE_NAME = 'rbp_token';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 16) {
  if (IS_PROD) {
    SECRET = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] ⚠ JWT_SECRET absent ou trop court en production : un secret aléatoire a été généré. ' +
        'Toutes les sessions seront perdues au prochain redémarrage.'
    );
  } else {
    SECRET = 'robotbotposte-dev-secret-ne-pas-utiliser-en-production';
  }
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: THIRTY_DAYS_MS,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export function readTokenFromCookieHeader(header = '') {
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === COOKIE_NAME) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

/** Récupère l'utilisateur à partir d'un en-tête Cookie brut (Socket.IO). */
export function userFromCookieHeader(header) {
  const token = readTokenFromCookieHeader(header);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.uid) return null;
  return { id: payload.uid, username: payload.username };
}

/** Middleware : attache req.user si un cookie valide est présent. */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const payload = verifyToken(token);
    if (payload?.uid) {
      req.user = { id: payload.uid, username: payload.username };
    }
  }
  next();
}

/** Middleware : exige une session valide. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }
  next();
}

/** Ne renvoie jamais le hash du mot de passe. */
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    bio: user.bio ?? '',
    avatar: user.avatar ?? '🤖',
    created_at: user.created_at,
  };
}
