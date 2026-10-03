ALTER TABLE profiles ADD COLUMN home_videos_only INTEGER NOT NULL DEFAULT 0 CHECK (home_videos_only IN (0, 1));
