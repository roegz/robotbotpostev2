import { Router } from 'express';
import { db, isoNow } from '../db.js';
import { publicUser, requireAuth } from '../auth.js';
import { ALLOWED_AVATARS } from '../config.js';

export const usersRouter = Router();

/**
 * Décrit la relation entre deux utilisateurs.
 * state: self | none | friends | outgoing | incoming
 */
export async function relationWith(meId, otherId) {
  if (meId === otherId) return { state: 'self' };

  const friendship = await db.get(
    `SELECT id, requester_id, status
     FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)
     LIMIT 1`,
    [meId, otherId, otherId, meId]
  );

  if (!friendship) return { state: 'none' };
  if (friendship.status === 'accepted') {
    return { state: 'friends', friendship_id: friendship.id };
  }
  return friendship.requester_id === meId
    ? { state: 'outgoing', friendship_id: friendship.id }
    : { state: 'incoming', friendship_id: friendship.id };
}

usersRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const updates = [];
    const params = [];

    if (req.body?.display_name !== undefined) {
      const displayName = String(req.body.display_name).trim();
      if (!displayName || displayName.length > 40) {
        return res.status(400).json({ error: 'Le nom affiché doit faire entre 1 et 40 caractères.' });
      }
      updates.push('display_name = ?');
      params.push(displayName);
    }

    if (req.body?.bio !== undefined) {
      const bio = String(req.body.bio).trim();
      if (bio.length > 160) {
        return res.status(400).json({ error: 'La bio est limitée à 160 caractères.' });
      }
      updates.push('bio = ?');
      params.push(bio);
    }

    if (req.body?.avatar !== undefined) {
      if (!ALLOWED_AVATARS.includes(req.body.avatar)) {
        return res.status(400).json({ error: 'Avatar non autorisé.' });
      }
      updates.push('avatar = ?');
      params.push(req.body.avatar);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'Rien à modifier.' });
    }

    params.push(req.user.id);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const raw = String(req.query.q ?? '').trim();
    if (raw.length < 1) return res.json({ users: [] });

    // On échappe les jokers SQL au lieu de les supprimer.
    const escaped = raw.replace(/[\\%_]/g, (char) => `\\${char}`);
    const pattern = `%${escaped.toLowerCase()}%`;
    const rows = await db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.bio,
              f.id AS friendship_id, f.status AS friendship_status, f.requester_id
       FROM users u
       LEFT JOIN friendships f
         ON (f.requester_id = u.id AND f.addressee_id = ?)
         OR (f.addressee_id = u.id AND f.requester_id = ?)
       WHERE u.id <> ?
         AND (LOWER(u.username) LIKE ? ESCAPE '\\' OR LOWER(u.display_name) LIKE ? ESCAPE '\\')
       ORDER BY u.username
       LIMIT 20`,
      [req.user.id, req.user.id, req.user.id, pattern, pattern]
    );

    const users = rows.map((row) => {
      let relation = { state: 'none' };
      if (row.friendship_id) {
        if (row.friendship_status === 'accepted') {
          relation = { state: 'friends', friendship_id: row.friendship_id };
        } else if (row.requester_id === req.user.id) {
          relation = { state: 'outgoing', friendship_id: row.friendship_id };
        } else {
          relation = { state: 'incoming', friendship_id: row.friendship_id };
        }
      }
      return {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        avatar: row.avatar,
        bio: row.bio,
        relation,
      };
    });

    return res.json({ users });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/:username', requireAuth, async (req, res, next) => {
  try {
    const username = String(req.params.username ?? '').toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const stats = await db.get(
      `SELECT
         (SELECT COUNT(*) FROM posts p WHERE p.user_id = ? AND p.expires_at > ?) AS post_count,
         (SELECT COUNT(*) FROM friendships f
           WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)) AS friend_count`,
      [user.id, isoNow(), user.id, user.id]
    );

    const relation = await relationWith(req.user.id, user.id);

    return res.json({
      user: publicUser(user),
      stats: {
        posts: Number(stats?.post_count ?? 0),
        friends: Number(stats?.friend_count ?? 0),
      },
      relation,
    });
  } catch (error) {
    next(error);
  }
});
