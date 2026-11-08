import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { MAX_UPLOAD_MB, UPLOAD_DIR } from '../config.js';

export const uploadRouter = Router();

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = MIME_EXTENSIONS[file.mimetype] ?? '';
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!MIME_EXTENSIONS[file.mimetype]) {
      const error = new Error(
        'Format non supporté. Utilise une image (JPG, PNG, WEBP, GIF) ou une vidéo (MP4, WEBM).'
      );
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

uploadRouter.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu.' });
  }

  return res.status(201).json({
    url: `/uploads/${path.basename(req.file.filename)}`,
    type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    size: req.file.size,
  });
});
