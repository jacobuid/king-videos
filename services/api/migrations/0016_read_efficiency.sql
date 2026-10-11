-- Build once, never on the request path. Primary keys already cover profile/media IDs.
CREATE INDEX IF NOT EXISTS media_created_id ON media(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS media_series_id ON media(series_id);
CREATE INDEX IF NOT EXISTS progress_profile_updated ON progress(profile_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS favorites_profile_sort ON favorites(profile_id,sort_order);
