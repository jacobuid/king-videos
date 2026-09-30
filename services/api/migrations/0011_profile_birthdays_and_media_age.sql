ALTER TABLE profiles ADD COLUMN date_of_birth TEXT;
ALTER TABLE media ADD COLUMN min_age INTEGER NOT NULL DEFAULT 0;

UPDATE profiles SET date_of_birth = '1985-11-06' WHERE lower(name) = 'dad';
UPDATE profiles SET date_of_birth = '1992-04-13' WHERE lower(name) = 'mom';
UPDATE profiles SET date_of_birth = '2014-08-12' WHERE lower(name) = 'gabbi';
UPDATE profiles SET date_of_birth = '2017-06-15' WHERE lower(name) = 'liam';
UPDATE profiles SET date_of_birth = '2018-10-02' WHERE lower(name) = 'josie';
UPDATE profiles SET date_of_birth = '2021-12-04' WHERE lower(name) = 'xander';
UPDATE profiles SET is_kids = 0;

UPDATE media
SET min_age = 12
WHERE series_id IN ('batman-the-animated-series', 'the-new-batman-adventures');
