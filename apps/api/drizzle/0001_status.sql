ALTER TABLE links
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS links_status_idx ON links (status);
