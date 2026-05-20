-- ============================================================
-- TaskMatrix — Sticky Notes Column Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Idempotent — safe to run multiple times
-- ============================================================

-- Add title column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sticky_notes' AND column_name = 'title'
  ) THEN
    ALTER TABLE sticky_notes ADD COLUMN title text DEFAULT 'Untitled';
  END IF;
END $$;

-- Add pinned column if it doesn't exist (BOOLEAN, not text!)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sticky_notes' AND column_name = 'pinned'
  ) THEN
    ALTER TABLE sticky_notes ADD COLUMN pinned boolean DEFAULT false;
  ELSE
    -- If column exists but is wrong type, fix it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sticky_notes' AND column_name = 'pinned'
      AND data_type <> 'boolean'
    ) THEN
      -- Convert text 'false'/'true' to boolean false/true
      ALTER TABLE sticky_notes 
        ALTER COLUMN pinned TYPE boolean 
        USING CASE 
          WHEN pinned::text = 'true' THEN true 
          ELSE false 
        END;
      ALTER TABLE sticky_notes ALTER COLUMN pinned SET DEFAULT false;
    END IF;
  END IF;
END $$;
