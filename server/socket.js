import { createMessage } from './dm.js';
import { userFromCookieHeader } from './auth.js';

/**
 * Branche Socket.IO : messagerie temps réel + pastilles de notifications.
 */
export function setupSocket(io) {
  io.use((socket, next) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie || '');
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`u:${user.id}`);
    socket.emit('ready', { id: user.id, username: user.username });

    socket.on('dm:send', async (payload, ack) => {
      try {
        const result = await createMessage(io, user, payload?.to, payload?.content);
        if (result.error) {
          return ack?.({ ok: false, error: result.error });
        }
        return ack?.({ ok: true, message: result.message });
      } catch (error) {
        console.error('[socket] dm:send', error);
        return ack?.({ ok: false, error: 'Erreur serveur.' });
      }
    });

    socket.on('dm:typing', (payload) => {
      const targetId = String(payload?.to ?? '');
      if (!targetId) return;
      io.to(`u:${targetId}`).emit('dm:typing', {
        fromId: user.id,
        username: user.username,
      });
    });
  });
}
