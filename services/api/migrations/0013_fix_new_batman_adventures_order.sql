-- The New Batman Adventures is one 24-episode season in its official episode guide.
-- Change catalog ordering only; preserve media IDs and B2 object keys.
UPDATE media
SET season_number = 1,
    episode_number = CASE title
      WHEN 'Holiday Knights' THEN 1
      WHEN 'Sins of The Father' THEN 2
      WHEN 'Cold Comfort' THEN 3
      WHEN 'Never Fear' THEN 4
      WHEN 'You Scratch My Back' THEN 5
      WHEN 'Double Talk' THEN 6
      WHEN 'Joker''s Millions' THEN 7
      WHEN 'Growing Pains' THEN 8
      WHEN 'Mean Seasons' THEN 9
      WHEN 'The Demon Within' THEN 10
      WHEN 'Over the Edge' THEN 11
      WHEN 'Torch Song' THEN 12
      WHEN 'Love is a Croc' THEN 13
      WHEN 'The Ultimate Thrill' THEN 14
      WHEN 'Cult of The Cat' THEN 15
      WHEN 'Critters' THEN 16
      WHEN 'Animal Act' THEN 17
      WHEN 'Old Wounds' THEN 18
      WHEN 'Legends of The Dark Knight' THEN 19
      WHEN 'Girls Night Out' THEN 20
      WHEN 'Chemistry' THEN 21
      WHEN 'Judgement Day' THEN 22
      WHEN 'Beware The Creeper' THEN 23
      WHEN 'Mad Love' THEN 24
      ELSE episode_number
    END
WHERE series_id = 'the-new-batman-adventures';
