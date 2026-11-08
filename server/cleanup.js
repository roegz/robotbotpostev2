import fs from 'node:fs/promises';
import path from 'node:path';
import { db, isoNow } from './db.js';
import { UPLOAD_DIR } from './config.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

async function purgeOrphanUploads() {
  let entries;
  try {
    entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(UPLOAD_DIR, entry.name);

    try {
      const stats = await fs.stat(filePath);
      if (Date.now() - stats.mtimeMs < TWO_HOURS_MS) continue;

      const referenced = await db.get(
        'SELECT 1 AS present FROM posts WHERE media_url = ? LIMIT 1',
        [`/uploads/${entry.name}`]
      );
      if (!referenced) await fs.unlink(filePath);
    } catch {
      // fichier déjà supprimé ou inaccessible : on ignore
    }
  }
}

/**
 * Supprime tout ce qui a dépassé sa durée de vie de 12 h.
 * Lancé au démarrage puis toutes les 2 minutes.
 */
export async function cleanupOnce() {
  const now = isoNow();

  // On note les fichiers à effacer avant que les lignes ne disparaissent.
  const expiredMedia = await db.all(
    `SELECT p.media_url
     FROM posts p
     WHERE p.media_url IS NOT NULL
       AND (p.expires_at <= ?
         OR p.repost_of IN (SELECT id FROM posts WHERE expires_at <= ?))`,
    [now, now]
  );

  const posts = await db.run('DELETE FROM posts WHERE expires_at <= ?', [now]);
  const comments = await db.run('DELETE FROM comments WHERE expires_at <= ?', [now]);
  const messages = await db.run('DELETE FROM messages WHERE expires_at <= ?', [now]);

  for (const row of expiredMedia) {
    if (!row.media_url) continue;
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(row.media_url))).catch(() => {});
  }

  await purgeOrphanUploads();

  const removed = (posts.changes ?? 0) + (comments.changes ?? 0) + (messages.changes ?? 0);
  if (removed > 0) {
    console.log(
      `[cleanup] ${posts.changes ?? 0} post(s), ${comments.changes ?? 0} commentaire(s), ` +
        `${messages.changes ?? 0} message(s) expiré(s) supprimé(s).`
    );
  }
}

export function startCleanup() {
  cleanupOnce().catch((error) => console.error('[cleanup] erreur :', error.message));
  const timer = setInterval(() => {
    cleanupOnce().catch((error) => console.error('[cleanup] erreur :', error.message));
  }, 2 * 60 * 1000);
  timer.unref?.();
  return timer;
}
