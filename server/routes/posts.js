import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { db, isoInHours, isoNow } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  TTL_HOURS,
  UPLOAD_DIR,
} from '../config.js';

export const postsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_RE = /^\/uploads\/[a-f0-9-]+\.[a-z0-9]{2,5}$/i;
const HASHTAG_RE = /#([\p{L}\p{N}_]{1,30})/gu;
const MAX_TAGS_PER_POST = 10;

/** Normalise un hashtag : minuscules, sans accents, sans ponctuation. */
function normalizeTag(value) {
  return String(value ?? '')
    .slice(0, 100)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 30);
}

function extractTags(content) {
  const tags = new Set();
  for (const match of String(content ?? '').matchAll(HASHTAG_RE)) {
    const tag = normalizeTag(match[1]);
    if (tag) tags.add(tag);
    if (tags.size >= MAX_TAGS_PER_POST) break;
  }
  return [...tags];
}

/** Clause SQL : le post courant OU son post d'origine porte ce tag. */
function tagClause() {
  return ` AND EXISTS (
    SELECT 1 FROM post_tags pt
    WHERE pt.tag = ? AND (pt.post_id = p.id OR pt.post_id = p.repost_of)
  )`;
}


/**
 * Sélection commune. Les placeholders `?` sont, dans l'ordre :
 *   1. maintenant        (compteur de commentaires)
 *   2. maintenant        (compteur de reposts)
 *   3. moi               (like sur le post)
 *   4. moi               (like sur le post d'origine)
 * puis les clauses WHERE.
 */
const POST_SELECT = `
WITH pc AS (
  SELECT p.id, p.user_id, p.content, p.media_url, p.media_type, p.created_at, p.expires_at, p.repost_of,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.expires_at > ?) AS comment_count,
    (SELECT COUNT(*) FROM posts r WHERE r.repost_of = p.id AND r.expires_at > ?) AS repost_count
  FROM posts p
)
SELECT
  p.id, p.content, p.media_url, p.media_type, p.created_at, p.expires_at, p.repost_of,
  p.like_count, p.comment_count, p.repost_count,
  u.id AS author_id, u.username AS author_username, u.display_name AS author_display_name, u.avatar AS author_avatar,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
  o.id AS orig_id, o.content AS orig_content, o.media_url AS orig_media_url, o.media_type AS orig_media_type,
  o.created_at AS orig_created_at, o.expires_at AS orig_expires_at,
  o.like_count AS orig_like_count, o.comment_count AS orig_comment_count, o.repost_count AS orig_repost_count,
  ou.id AS orig_author_id, ou.username AS orig_author_username,
  ou.display_name AS orig_author_display_name, ou.avatar AS orig_author_avatar,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = o.id AND l.user_id = ?) AS orig_liked
FROM pc p
JOIN users u ON u.id = p.user_id
LEFT JOIN pc o ON o.id = p.repost_of
LEFT JOIN users ou ON ou.id = o.user_id
`;

function mapMedia(url, type) {
  if (!url) return null;
  return { url, type: type === 'video' ? 'video' : 'image' };
}

function mapPost(row, now = isoNow()) {
  const post = {
    id: row.id,
    content: row.content ?? '',
    media: mapMedia(row.media_url, row.media_type),
    created_at: row.created_at,
    expires_at: row.expires_at,
    author: {
      id: row.author_id,
      username: row.author_username,
      display_name: row.author_display_name,
      avatar: row.author_avatar,
    },
    counts: {
      likes: Number(row.like_count ?? 0),
      comments: Number(row.comment_count ?? 0),
      reposts: Number(row.repost_count ?? 0),
    },
    liked: Boolean(row.liked),
    repost_of: null,
  };

  if (row.repost_of) {
    if (!row.orig_id || !row.orig_expires_at || String(row.orig_expires_at) <= now) {
      post.repost_of = { id: row.repost_of, expired: true };
    } else {
      post.repost_of = {
        id: row.orig_id,
        content: row.orig_content ?? '',
        media: mapMedia(row.orig_media_url, row.orig_media_type),
        created_at: row.orig_created_at,
        expires_at: row.orig_expires_at,
        author: {
          id: row.orig_author_id,
          username: row.orig_author_username,
          display_name: row.orig_author_display_name,
          avatar: row.orig_author_avatar,
        },
        counts: {
          likes: Number(row.orig_like_count ?? 0),
          comments: Number(row.orig_comment_count ?? 0),
          reposts: Number(row.orig_repost_count ?? 0),
        },
        liked: Boolean(row.orig_liked),
        repost_of: null,
      };
    }
  }

  return post;
}

async function fetchPost(id, viewerId, now = isoNow()) {
  const row = await db.get(`${POST_SELECT} WHERE p.id = ? AND p.expires_at > ?`, [
    now,
    now,
    viewerId,
    viewerId,
    id,
    now,
  ]);
  return row ? mapPost(row, now) : null;
}

async function deleteUpload(url) {
  if (!url) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  await fs.unlink(file).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

postsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const now = isoNow();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const scope = ['friends', 'all', 'user'].includes(req.query.scope)
      ? req.query.scope
      : 'friends';
    const sort = ['top', 'random'].includes(req.query.sort) ? req.query.sort : 'recent';

    const rawTag = req.query.tag;
    const tag = rawTag === undefined ? null : normalizeTag(rawTag);
    if (rawTag !== undefined && !tag) {
      return res.json({ posts: [], next: null });
    }

    const params = [now, now, me, me];
    let where = 'p.expires_at > ?';
    params.push(now);

    if (scope === 'friends') {
      where += ` AND (p.user_id = ? OR p.user_id IN (
        SELECT CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
        FROM friendships f
        WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
      ))`;
      params.push(me, me, me, me);
    } else if (scope === 'user') {
      where += ' AND p.user_id = (SELECT id FROM users WHERE username = ?)';
      params.push(String(req.query.username ?? '').toLowerCase());
    }

    if (tag) {
      where += tagClause();
      params.push(tag);
    }

    let offset = 0;
    if (sort === 'recent' && req.query.before) {
      const before = String(req.query.before);
      const beforeId = String(req.query.before_id ?? '');
      where += ' AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))';
      params.push(before, before, beforeId);
    } else if (sort === 'top') {
      offset = Math.max(0, Number(req.query.offset) || 0);
    }

    const orderBy =
      sort === 'random'
        ? 'ORDER BY RANDOM()'
        : sort === 'top'
          ? 'ORDER BY p.like_count DESC, p.comment_count DESC, p.created_at DESC, p.id DESC'
          : 'ORDER BY p.created_at DESC, p.id DESC';

    params.push(limit);
    let sql = `${POST_SELECT} WHERE ${where} ${orderBy} LIMIT ?`;
    if (sort === 'top') {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    const rows = await db.all(sql, params);
    const posts = rows.map((row) => mapPost(row, now));

    let next = null;
    if (sort !== 'random' && posts.length === limit) {
      if (sort === 'top') {
        next = { offset: offset + posts.length };
      } else {
        const last = posts.at(-1);
        next = { before: last.created_at, before_id: last.id };
      }
    }

    return res.json({ posts, next });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Hashtags tendance                                                   */
/* ------------------------------------------------------------------ */

postsRouter.get('/tags', requireAuth, async (req, res, next) => {
  try {
    const now = isoNow();
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));

    const rows = await db.all(
      `SELECT t.tag AS tag, COUNT(*) AS n
       FROM post_tags t
       JOIN posts p ON p.id = t.post_id
       WHERE p.expires_at > ?
       GROUP BY t.tag
       ORDER BY n DESC, t.tag ASC
       LIMIT ?`,
      [now, limit]
    );

    return res.json({
      tags: rows.map((row) => ({ tag: row.tag, count: Number(row.n ?? 0) })),
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Reels (scroll vertical de vidéos)                                   */
/* ------------------------------------------------------------------ */

postsRouter.get('/reels', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const now = isoNow();
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));

    const rawTag = req.query.tag;
    const tag = rawTag === undefined ? null : normalizeTag(rawTag);
    if (rawTag !== undefined && !tag) {
      return res.json({ posts: [] });
    }

    const params = [now, now, me, me, now];
    let where = `p.expires_at > ?
      AND p.media_type = 'video'
      AND p.media_url IS NOT NULL
      AND p.repost_of IS NULL`;

    if (tag) {
      where += tagClause();
      params.push(tag);
    }

    if (req.query.before) {
      const before = String(req.query.before);
      const beforeId = String(req.query.before_id ?? '');
      where += ' AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))';
      params.push(before, before, beforeId);
    }

    params.push(limit);

    const rows = await db.all(
      `${POST_SELECT} WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      params
    );

    return res.json({ posts: rows.map((row) => mapPost(row, now)) });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Création                                                            */
/* ------------------------------------------------------------------ */

postsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user.id;
    const now = isoNow();

    const content =
      typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (content.length > MAX_POST_LENGTH) {
      return res
        .status(400)
        .json({ error: `Post trop long (${MAX_POST_LENGTH} caractères max).` });
    }

    let mediaUrl = null;
    let mediaType = null;
    if (req.body?.media_url) {
      if (typeof req.body.media_url !== 'string' || !MEDIA_RE.test(req.body.media_url)) {
        return res.status(400).json({ error: 'Média invalide.' });
      }
      mediaUrl = req.body.media_url;
      mediaType = req.body.media_type === 'video' ? 'video' : 'image';
    }

    let repostOf = null;
    if (req.body?.repost_of) {
      if (!UUID_RE.test(String(req.body.repost_of))) {
        return res.status(400).json({ error: 'Post d’origine invalide.' });
      }
      const target = await db.get(
        'SELECT id, repost_of FROM posts WHERE id = ? AND expires_at > ?',
        [req.body.repost_of, now]
      );
      if (!target) {
        return res.status(404).json({ error: 'Le post d’origine a expiré.' });
      }
      repostOf = target.repost_of || target.id;
    }

    if (!content && !mediaUrl && !repostOf) {
      return res.status(400).json({ error: 'Écris quelque chose ou ajoute un média.' });
    }

    if (repostOf && !content && !mediaUrl) {
      const duplicate = await db.get(
        `SELECT id FROM posts
         WHERE user_id = ? AND repost_of = ? AND content = '' AND media_url IS NULL
           AND expires_at > ?`,
        [me, repostOf, now]
      );
      if (duplicate) {
        return res.status(409).json({ error: 'Tu as déjà republié ce post.' });
      }
    }

    const id = crypto.randomUUID();
    const expiresAt = isoInHours(TTL_HOURS);

    await db.run(
      `INSERT INTO posts (id, user_id, content, media_url, media_type, repost_of, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, me, content, mediaUrl, mediaType, repostOf, now, expiresAt]
    );

    // Indexation des hashtags pour les pages de thème et les tendances.
    const tags = extractTags(content);
    for (const tag of tags) {
      await db.run(
        'INSERT INTO post_tags (post_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING',
        [id, tag]
      );
    }

    const post = await fetchPost(id, me, now);

    // Prévenir les amis en temps réel.
    const io = req.app.get('io');
    if (io) {
      db.all(
        `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS uid
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
        [me, me, me]
      )
        .then((friends) => {
          for (const friend of friends) {
            io.to(`u:${friend.uid}`).emit('post:new', { username: req.user.username });
          }
        })
        .catch(() => {});
    }

    return res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Détail / suppression                                                */
/* ------------------------------------------------------------------ */

postsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).json({ error: 'Post introuvable.' });
    }
    const post = await fetchPost(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ error: 'Post introuvable ou expiré.' });
    return res.json({ post });
  } catch (error) {
    next(error);
  }
});

postsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await db.get('SELECT id, user_id, media_url FROM posts WHERE id = ?', [
      req.params.id,
    ]);
    if (!post) return res.status(404).json({ error: 'Post introuvable.' });
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Ce post ne t’appartient pas.' });
    }

    await db.run('DELETE FROM posts WHERE id = ?', [post.id]);
    await deleteUpload(post.media_url);

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Likes                                                               */
/* ------------------------------------------------------------------ */

postsRouter.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const now = isoNow();
    const post = await db.get('SELECT id FROM posts WHERE id = ? AND expires_at > ?', [
      req.params.id,
      now,
    ]);
    if (!post) return res.status(404).json({ error: 'Post introuvable ou expiré.' });

    const inserted = await db.all(
      `INSERT INTO likes (post_id, user_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT (post_id, user_id) DO NOTHING
       RETURNING post_id`,
      [post.id, req.user.id, now]
    );

    let liked;
    if (inserted.length > 0) {
      liked = true;
    } else {
      await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [
        post.id,
        req.user.id,
      ]);
      liked = false;
    }

    const total = await db.get('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?', [post.id]);
    return res.json({ liked, count: Number(total?.n ?? 0) });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Commentaires                                                        */
/* ------------------------------------------------------------------ */

function mapComment(row) {
  return {
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    expires_at: row.expires_at,
    author: {
      id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar: row.avatar,
    },
  };
}

postsRouter.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const now = isoNow();
    const post = await db.get('SELECT id FROM posts WHERE id = ? AND expires_at > ?', [
      req.params.id,
      now,
    ]);
    if (!post) return res.status(404).json({ error: 'Post introuvable ou expiré.' });

    const rows = await db.all(
      `SELECT c.*, u.username, u.display_name, u.avatar
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? AND c.expires_at > ?
       ORDER BY c.created_at ASC, c.id ASC`,
      [post.id, now]
    );

    return res.json({ comments: rows.map(mapComment) });
  } catch (error) {
    next(error);
  }
});

postsRouter.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const now = isoNow();
    const content = String(req.body?.content ?? '').trim();

    if (!content) return res.status(400).json({ error: 'Commentaire vide.' });
    if (content.length > MAX_COMMENT_LENGTH) {
      return res
        .status(400)
        .json({ error: `Commentaire trop long (${MAX_COMMENT_LENGTH} caractères max).` });
    }

    const post = await db.get('SELECT id FROM posts WHERE id = ? AND expires_at > ?', [
      req.params.id,
      now,
    ]);
    if (!post) return res.status(404).json({ error: 'Post introuvable ou expiré.' });

    const id = crypto.randomUUID();
    const expiresAt = isoInHours(TTL_HOURS);

    await db.run(
      `INSERT INTO comments (id, post_id, user_id, content, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, post.id, req.user.id, content, now, expiresAt]
    );

    const row = await db.get(
      `SELECT c.*, u.username, u.display_name, u.avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [id]
    );

    const total = await db.get(
      'SELECT COUNT(*) AS n FROM comments WHERE post_id = ? AND expires_at > ?',
      [post.id, now]
    );

    return res.status(201).json({
      comment: mapComment(row),
      count: Number(total?.n ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

postsRouter.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const comment = await db.get('SELECT id, user_id FROM comments WHERE id = ?', [
      req.params.id,
    ]);
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' });
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Ce commentaire ne t’appartient pas.' });
    }
    await db.run('DELETE FROM comments WHERE id = ?', [comment.id]);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
