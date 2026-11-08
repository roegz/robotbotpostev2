import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, isoNow } from '../db.js';
import {
  clearAuthCookie,
  publicUser,
  requireAuth,
  setAuthCookie,
  signToken,
} from '../auth.js';
import { ALLOWED_AVATARS } from '../config.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessaie dans quelques minutes.' },
});

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const displayName = String(req.body?.display_name ?? '').trim();
    const password = req.body?.password;
    const avatar = ALLOWED_AVATARS.includes(req.body?.avatar) ? req.body.avatar : '🤖';

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Pseudo invalide : 3 à 20 caractères, lettres minuscules, chiffres ou _.',
      });
    }
    if (!displayName || displayName.length > 40) {
      return res.status(400).json({ error: 'Le nom affiché doit faire entre 1 et 40 caractères.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
    }
    if (password.length > 200) {
      return res.status(400).json({ error: 'Mot de passe trop long.' });
    }

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = isoNow();

    await db.run(
      `INSERT INTO users (id, username, display_name, password_hash, bio, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, username, displayName, passwordHash, '', avatar, createdAt]
    );

    const user = { id, username, display_name: displayName, bio: '', avatar, created_at: createdAt };
    setAuthCookie(res, signToken(user));

    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || typeof password !== 'string') {
      return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
    }

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
    }

    setAuthCookie(res, signToken(user));
    return res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.user) return res.json({ user: null });
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      clearAuthCookie(res);
      return res.json({ user: null });
    }
    return res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});
