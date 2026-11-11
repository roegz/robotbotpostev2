import './config.js';

import http from 'node:http';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';

import {
  ALLOWED_AVATARS,
  APP_NAME,
  IS_PROD,
  MAX_COMMENT_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_POST_LENGTH,
  MAX_UPLOAD_MB,
  PUBLIC_DIR,
  TTL_HOURS,
  UPLOAD_DIR,
} from './config.js';
import { db, DB_KIND } from './db.js';
import { attachUser } from './auth.js';
import { setupSocket } from './socket.js';
import { startCleanup } from './cleanup.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { friendsRouter } from './routes/friends.js';
import { postsRouter } from './routes/posts.js';
import { messagesRouter } from './routes/messages.js';
import { uploadRouter } from './routes/upload.js';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Compression gzip/brotli : le CSS et les réponses JSON voyagent beaucoup
// plus léger (utile sur mobile et sur les petites connexions).
app.use(compression({ threshold: 1024 }));

/* ------------------------------------------------------------------ */
/* Sécurité                                                            */
/* ------------------------------------------------------------------ */

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Protection CSRF légère : refuse les écritures venant d'une autre origine.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.headers.host) {
      return res.status(403).json({ error: 'Origine non autorisée.' });
    }
  } catch {
    return res.status(403).json({ error: 'Origine invalide.' });
  }
  return next();
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Ralentis un peu.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 80,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop d’envois de fichiers. Réessaie plus tard.' },
});

app.use('/api', apiLimiter);
app.use(attachUser);

/* ------------------------------------------------------------------ */
/* Métadonnées publiques                                               */
/* ------------------------------------------------------------------ */

app.get('/api/health', async (_req, res) => {
  try {
    await db.ping();
    res.json({ ok: true, app: APP_NAME, db: DB_KIND, ttl_hours: TTL_HOURS });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    app: APP_NAME,
    ttl_hours: TTL_HOURS,
    max_post_length: MAX_POST_LENGTH,
    max_comment_length: MAX_COMMENT_LENGTH,
    max_message_length: MAX_MESSAGE_LENGTH,
    max_upload_mb: MAX_UPLOAD_MB,
    avatars: ALLOWED_AVATARS,
  });
});

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/upload', uploadLimiter, uploadRouter);

/* ------------------------------------------------------------------ */
/* Fichiers statiques                                                  */
/* ------------------------------------------------------------------ */

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: 'deny',
    maxAge: '1d',
    fallthrough: true,
  })
);

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge: IS_PROD ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Application monopage : toute route inconnue renvoie index.html.
app.get('*', (req, res) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/api') ||
    req.path.startsWith('/uploads/') ||
    req.path.startsWith('/socket.io/')
  ) {
    return res.status(404).json({ error: 'Introuvable.' });
  }
  return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ------------------------------------------------------------------ */
/* Erreurs                                                             */
/* ------------------------------------------------------------------ */

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ error: `Fichier trop lourd (maximum ${MAX_UPLOAD_MB} Mo).` });
  }
  if (error?.name === 'MulterError') {
    return res.status(400).json({ error: `Upload refusé : ${error.message}` });
  }

  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('[erreur]', error);

  return res.status(status).json({
    error: status >= 500 ? 'Erreur interne du serveur.' : error.message,
  });
});

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  maxHttpBufferSize: 1_000_000,
  pingTimeout: 25_000,
});
app.set('io', io);
setupSocket(io);

async function start() {
  await db.init();
  startCleanup();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`  ⚙  ${APP_NAME} en ligne sur http://localhost:${PORT}`);
    console.log(`  🗄  base de données : ${DB_KIND === 'postgres' ? 'PostgreSQL' : 'SQLite (fichier local)'}`);
    console.log(`  ⏳ expiration automatique : ${TTL_HOURS} h`);
    console.log('');
  });
}

start().catch((error) => {
  console.error('Impossible de démarrer le serveur :', error);
  process.exit(1);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[${signal}] arrêt du serveur…`);
  io.close();
  server.close();
  await db.close().catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[promesse rejetée]', reason);
});
