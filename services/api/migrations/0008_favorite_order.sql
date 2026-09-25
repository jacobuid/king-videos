ALTER TABLE favorites ADD COLUMN sort_order INTEGER;
UPDATE favorites SET sort_order = rowid WHERE sort_order IS NULL;
