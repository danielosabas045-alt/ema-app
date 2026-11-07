-- Compatible with EMA's original schema; never drops existing workspace data.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','moderator','user')),
  status TEXT NOT NULL DEFAULT 'pending',
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS records (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Normalize a legacy suspension label without reactivating any account.
UPDATE users SET status='suspended' WHERE status='disabled';
ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS invitations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  last_error TEXT
);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE invitations ALTER COLUMN sent_at DROP NOT NULL;
UPDATE invitations SET status='accepted' WHERE accepted_at IS NOT NULL AND status='sent';
UPDATE invitations SET status='failed' WHERE last_error IS NOT NULL AND accepted_at IS NULL AND status='sent';
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS records_owner_created_idx ON records(owner_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS records_created_idx ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_user_idx ON invitations(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS users_invite_hash_idx ON users(invite_token_hash) WHERE invite_token_hash IS NOT NULL;
