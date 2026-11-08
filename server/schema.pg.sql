-- Schéma PostgreSQL (mode production / données durables).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT NOT NULL DEFAULT '🤖',
  created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL,
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  media_url  TEXT,
  media_type TEXT,
  repost_of  TEXT REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  read_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_posts_created  ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user     ON posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_expires  ON posts (expires_at);
CREATE INDEX IF NOT EXISTS idx_posts_repost   ON posts (repost_of);
CREATE INDEX IF NOT EXISTS idx_comments_post  ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_exp   ON comments (expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_pair  ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recip ON messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_exp   ON messages (expires_at);
CREATE INDEX IF NOT EXISTS idx_friends_lookup ON friendships (requester_id, addressee_id);
