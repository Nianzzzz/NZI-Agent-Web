-- T004 Phase 2 — Message status migration
-- Adds MessageStatus enum and status column (default COMPLETED)

DO $$ BEGIN
  CREATE TYPE MessageStatus AS ENUM ('COMPLETED', 'INTERRUPTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS status MessageStatus NOT NULL DEFAULT 'COMPLETED'::MessageStatus;
