CREATE TABLE IF NOT EXISTS links (
  slug VARCHAR(64) PRIMARY KEY,
  destination TEXT NOT NULL,
  notes TEXT,
  hits BIGINT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS links_destination_idx ON links (destination);
