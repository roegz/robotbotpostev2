import crypto from 'node:crypto';
import { Router } from 'express';
import { db, isoNow } from '../db.js';
import { requireAuth } from '../auth.js';

export const friendsRouter = Router();

const friendSelect = (extraWhere) => `
  SELECT f.id AS friendship_id, f.status, f.requester_id, f.created_at AS since,
         u.id, u.username, u.display_name, u.avatar, u.bio
  FROM friendships f
  JOIN users u ON u.id = CASE
    WHEN f.requester_id = ? THEN f.addressee_id
    ELSE f.requester_id
  END
  WHERE ${extraWhere}
`;

friendsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;

    const [friends, incoming, outgoing] = await Promise.all([
      db.all(
        `${friendSelect(`f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)`)}
         ORDER BY LOWER(u.display_name)`,
        [me, me, me]
      ),
      db.all(
        `${friendSelect(`f.status = 'pending' AND f.addressee_id = ?`)} ORDER BY f.created_at DESC`,
        [me, me]
      ),
      db.all(
        `${friendSelect(`f.status = 'pending' AND f.requester_id = ?`)} ORDER BY f.created_at DESC`,
        [me, me]
      ),
    ]);

    return res.json({
      friends: friends.map((row) => ({
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        avatar: row.avatar,
        bio: row.bio,
        friendship_id: row.friendship_id,
        since: row.since,
      })),
      incoming: incoming.map((row) => ({
        friendship_id: row.friendship_id,
        user: {
          id: row.id,
          username: row.username,
          display_name: row.display_name,
          avatar: row.avatar,
          bio: row.bio,
        },
        created_at: row.since,
      })),
      outgoing: outgoing.map((row) => ({
        friendship_id: row.friendship_id,
        user: {
          id: row.id,
          username: row.username,
          display_name: row.display_name,
          avatar: row.avatar,
          bio: row.bio,
        },
        created_at: row.since,
      })),
    });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/request', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const username = String(req.body?.username ?? '').toLowerCase().trim();
    if (!username) return res.status(400).json({ error: 'Pseudo requis.' });

    const target = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (target.id === me) return res.status(400).json({ error: 'Tu ne peux pas t’ajouter toi-même.' });

    const existing = await db.get(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?)
          OR (requester_id = ? AND addressee_id = ?)
       LIMIT 1`,
      [me, target.id, target.id, me]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.json({ relation: { state: 'friends', friendship_id: existing.id } });
      }
      if (existing.requester_id === me) {
        return res.json({ relation: { state: 'outgoing', friendship_id: existing.id } });
      }
      // Demande inverse en attente : on accepte automatiquement.
      await db.run(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [existing.id]);
      return res.json({ relation: { state: 'friends', friendship_id: existing.id } });
    }

    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
      [id, me, target.id, isoNow()]
    );

    const io = req.app.get('io');
    io?.to(`u:${target.id}`).emit('friend:request', { from: { username: req.user.username } });

    return res.status(201).json({ relation: { state: 'outgoing', friendship_id: id } });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/:id/accept', requireAuth, async (req, res, next) => {
  try {
    const friendship = await db.get('SELECT * FROM friendships WHERE id = ?', [req.params.id]);
    if (!friendship) return res.status(404).json({ error: 'Demande introuvable.' });
    if (friendship.addressee_id !== req.user.id) {
      return res.status(403).json({ error: 'Cette demande ne t’est pas destinée.' });
    }

    await db.run(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [friendship.id]);

    const io = req.app.get('io');
    io?.to(`u:${friendship.requester_id}`).emit('friend:accepted', { username: req.user.username });

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/:id/decline', requireAuth, async (req, res, next) => {
  try {
    const friendship = await db.get('SELECT * FROM friendships WHERE id = ?', [req.params.id]);
    if (!friendship) return res.status(404).json({ error: 'Demande introuvable.' });
    if (friendship.addressee_id !== req.user.id && friendship.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'Action non autorisée.' });
    }
    await db.run('DELETE FROM friendships WHERE id = ?', [friendship.id]);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

friendsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const friendship = await db.get('SELECT * FROM friendships WHERE id = ?', [req.params.id]);
    if (!friendship) return res.status(404).json({ error: 'Amitié introuvable.' });
    if (friendship.requester_id !== req.user.id && friendship.addressee_id !== req.user.id) {
      return res.status(403).json({ error: 'Action non autorisée.' });
    }
    await db.run('DELETE FROM friendships WHERE id = ?', [friendship.id]);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
