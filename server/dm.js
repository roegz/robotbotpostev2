import crypto from 'node:crypto';
import { db, isoInHours, isoNow } from './db.js';
import { MAX_MESSAGE_LENGTH, TTL_HOURS } from './config.js';

/**
 * Crée un message privé, le persiste et le diffuse en temps réel.
 * @returns {{ message?: object, recipient?: object, error?: string, status?: number }}
 */
export async function createMessage(io, sender, recipientUsername, rawContent) {
  const content = String(rawContent ?? '').trim();

  if (!content) {
    return { error: 'Message vide.', status: 400 };
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      error: `Message trop long (${MAX_MESSAGE_LENGTH} caractères max).`,
      status: 400,
    };
  }

  const username = String(recipientUsername ?? '').toLowerCase().trim();
  const recipient = await db.get(
    'SELECT id, username, display_name, avatar FROM users WHERE username = ?',
    [username]
  );

  if (!recipient) {
    return { error: 'Utilisateur introuvable.', status: 404 };
  }
  if (recipient.id === sender.id) {
    return { error: 'Tu ne peux pas t’envoyer un message à toi-même.', status: 400 };
  }

  const id = crypto.randomUUID();
  const createdAt = isoNow();
  const expiresAt = isoInHours(TTL_HOURS);

  await db.run(
    `INSERT INTO messages (id, sender_id, recipient_id, content, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sender.id, recipient.id, content, createdAt, expiresAt]
  );

  const message = {
    id,
    content,
    created_at: createdAt,
    expires_at: expiresAt,
    sender_id: sender.id,
    recipient_id: recipient.id,
    sender_username: sender.username,
    recipient_username: recipient.username,
  };

  if (io) {
    io.to(`u:${recipient.id}`).emit('dm:new', {
      message,
      other: { id: sender.id, username: sender.username },
    });
    io.to(`u:${sender.id}`).emit('dm:new', {
      message,
      other: { id: recipient.id, username: recipient.username },
    });
  }

  return { message, recipient };
}
