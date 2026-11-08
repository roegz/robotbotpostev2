import { Router } from 'express';
import { db, isoNow } from '../db.js';
import { publicUser, requireAuth } from '../auth.js';
import { createMessage } from '../dm.js';
import { TTL_HOURS } from '../config.js';

export const messagesRouter = Router();

messagesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const now = isoNow();

    const rows = await db.all(
      `SELECT t.other_id, t.content AS last_content, t.created_at AS last_at,
              t.sender_id AS last_sender_id,
              u.username, u.display_name, u.avatar
       FROM (
         SELECT m.id, m.sender_id, m.recipient_id, m.content, m.created_at,
           CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END AS other_id,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
             ORDER BY m.created_at DESC, m.id DESC
           ) AS rn
         FROM messages m
         WHERE (m.sender_id = ? OR m.recipient_id = ?) AND m.expires_at > ?
       ) t
       JOIN users u ON u.id = t.other_id
       WHERE t.rn = 1
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [me, me, me, me, now]
    );

    const unreadRows = await db.all(
      `SELECT sender_id, COUNT(*) AS n
       FROM messages
       WHERE recipient_id = ? AND read_at IS NULL AND expires_at > ?
       GROUP BY sender_id`,
      [me, now]
    );

    const unreadByUser = new Map(
      unreadRows.map((row) => [row.sender_id, Number(row.n)])
    );

    const conversations = rows.map((row) => ({
      user: {
        id: row.other_id,
        username: row.username,
        display_name: row.display_name,
        avatar: row.avatar,
      },
      last: {
        content: row.last_content,
        created_at: row.last_at,
        from_me: row.last_sender_id === me,
      },
      unread: unreadByUser.get(row.other_id) ?? 0,
    }));

    const unread = conversations.reduce((sum, conversation) => sum + conversation.unread, 0);

    return res.json({ conversations, unread, ttl_hours: TTL_HOURS });
  } catch (error) {
    next(error);
  }
});

messagesRouter.get('/:username', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const now = isoNow();
    const username = String(req.params.username ?? '').toLowerCase();

    const other = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!other) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (other.id === me) {
      return res.status(400).json({ error: 'Impossible d’ouvrir une conversation avec soi-même.' });
    }

    const rows = await db.all(
      `SELECT m.*, s.username AS sender_username
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       WHERE m.expires_at > ?
         AND ((m.sender_id = ? AND m.recipient_id = ?)
           OR (m.sender_id = ? AND m.recipient_id = ?))
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 500`,
      [now, me, other.id, other.id, me]
    );

    await db.run(
      `UPDATE messages SET read_at = ?
       WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`,
      [now, me, other.id]
    );

    const io = req.app.get('io');
    io?.to(`u:${other.id}`).emit('dm:read', { by: req.user.username });

    return res.json({
      user: publicUser(other),
      messages: rows.map((row) => ({
        id: row.id,
        content: row.content,
        created_at: row.created_at,
        expires_at: row.expires_at,
        sender_id: row.sender_id,
        recipient_id: row.recipient_id,
        sender_username: row.sender_username,
      })),
      ttl_hours: TTL_HOURS,
    });
  } catch (error) {
    next(error);
  }
});

messagesRouter.post('/:username', requireAuth, async (req, res, next) => {
  try {
    const result = await createMessage(
      req.app.get('io'),
      req.user,
      req.params.username,
      req.body?.content
    );

    if (result.error) {
      return res.status(result.status ?? 400).json({ error: result.error });
    }

    return res.status(201).json({ message: result.message });
  } catch (error) {
    next(error);
  }
});
