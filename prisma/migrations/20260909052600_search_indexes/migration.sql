-- Full-text search support for uploaded document chunks and global search.
-- These are hand-written additions on top of the Prisma-managed schema.

-- Generated tsvector column for document chunks (kept in sync automatically).
ALTER TABLE "DocumentChunk"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;

CREATE INDEX IF NOT EXISTS "DocumentChunk_search_vector_idx"
  ON "DocumentChunk" USING GIN ("search_vector");

-- Trigram indexes speed up fuzzy matching in global search. pg_trgm is a
-- contrib extension that some managed/embedded Postgres builds do not ship, so
-- the app must work without it — we only add the indexes when it is available.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm unavailable; skipping trigram indexes';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "Task_title_trgm_idx" ON "Task" USING GIN ("title" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Course_name_trgm_idx" ON "Course" USING GIN ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Resource_title_trgm_idx" ON "Resource" USING GIN ("title" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Document_name_trgm_idx" ON "Document" USING GIN ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Institution_name_trgm_idx" ON "Institution" USING GIN ("name" gin_trgm_ops);
  END IF;
END $$;
