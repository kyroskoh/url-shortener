ALTER TABLE links
  ADD COLUMN IF NOT EXISTS max_hits INTEGER;

CREATE TABLE IF NOT EXISTS hit_aggregates (
  slug VARCHAR(64) NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  hits BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, bucket_start)
);

CREATE INDEX IF NOT EXISTS hit_aggregates_bucket_start_idx ON hit_aggregates (bucket_start);
