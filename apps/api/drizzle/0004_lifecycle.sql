-- Soft pause (status value) + delayed activation
ALTER TABLE links
  ADD COLUMN IF NOT EXISTS active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS links_active_at_idx ON links (active_at)
  WHERE active_at IS NOT NULL;
