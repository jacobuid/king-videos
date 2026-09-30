-- Correct Batman: The Animated Series to the DVD order used by the official episode guide.
-- This changes catalog ordering only; media IDs and B2 object keys remain unchanged.
UPDATE media
SET season_number = CASE title
  WHEN 'On Leather Wings' THEN 1
  WHEN 'Christmas with The Joker' THEN 1
  WHEN 'Nothing to Fear' THEN 1
  WHEN 'The Last Laugh' THEN 1
  WHEN 'Pretty Poison' THEN 1
  WHEN 'The Underdwellers' THEN 1
  WHEN 'P.O.V' THEN 1
  WHEN 'Forgotten' THEN 1
  WHEN 'Be a Clown' THEN 1
  WHEN 'Two-Face, Part 1' THEN 1
  WHEN 'Two-Face, Part 2' THEN 1
  WHEN 'It''s Never Too Late' THEN 1
  WHEN 'I''ve Got Batman in My Basement' THEN 1
  WHEN 'Heart of Ice' THEN 1
  WHEN 'The Cat and The Claw, Part 1' THEN 1
  WHEN 'The Cat and The Claw, Part 2' THEN 1
  WHEN 'See No Evil' THEN 1
  WHEN 'Beware The Gray Ghost' THEN 1
  WHEN 'Prophecy of Doom' THEN 1
  WHEN 'Feat of Clay, Part 1' THEN 1
  WHEN 'Feat of Clay, Part 2' THEN 1
  WHEN 'Joker''s Favor' THEN 1
  WHEN 'Vendetta' THEN 1
  WHEN 'Fear of Victory' THEN 1
  WHEN 'The Clock King' THEN 1
  WHEN 'Appointment in Crime Alley' THEN 1
  WHEN 'Mad As A Hatter' THEN 1
  WHEN 'Dreams in Darkness' THEN 1
  WHEN 'Eternal Youth' THEN 1
  WHEN 'Perchance to Dream' THEN 1
  WHEN 'The Cape and Cowl Conspiracy' THEN 1
  WHEN 'Robin''s Reckoning, Part 1' THEN 1
  WHEN 'Robin''s Reckoning, Part 2' THEN 1
  WHEN 'The Laughing Fish' THEN 1
  WHEN 'Night of The Ninja' THEN 1
  WHEN 'Cat Scratch Fever' THEN 1
  WHEN 'The Strange Secret of Bruce Wayne' THEN 1
  WHEN 'Heart of Steel, Part 1' THEN 1
  WHEN 'Heart of Steel, Part 2' THEN 1
  WHEN 'If You''re So Smart, Why Aren''t You Rich' THEN 1
  WHEN 'Joker''s Wild' THEN 1
  WHEN 'Tyger, Tyger' THEN 1
  WHEN 'Moon of the Wolf' THEN 1
  WHEN 'Day of The Samurai' THEN 1
  WHEN 'Terror in the Sky' THEN 1
  WHEN 'Almost Got ''Im' THEN 1
  WHEN 'Birds of a Feather' THEN 1
  WHEN 'What Is Reality' THEN 1
  WHEN 'I Am The Night' THEN 1
  WHEN 'Off Balance' THEN 1
  WHEN 'The Man Who Killed Batman' THEN 1
  WHEN 'Mudslide' THEN 1
  WHEN 'Paging The Crime Doctor' THEN 1
  WHEN 'Zatanna' THEN 1
  WHEN 'The Mechanic' THEN 1
  WHEN 'Harley and Ivy' THEN 1
  WHEN 'Shadow of The Bat, Part 1' THEN 1
  WHEN 'Shadow of The Bat, Part 2' THEN 1
  WHEN 'Blind as a Batman' THEN 1
  WHEN 'The Demon''s Quest, Part 1' THEN 1
  WHEN 'The Demon''s Quest, Part 2' THEN 1
  WHEN 'His Silicon Soul' THEN 1
  WHEN 'Fire From Olympus' THEN 1
  WHEN 'Read My Lips' THEN 1
  WHEN 'The Worry Men' THEN 1
  WHEN 'Sideshow' THEN 2
  WHEN 'A Bullet for Bullock' THEN 2
  WHEN 'Trial' THEN 2
  WHEN 'Avatar' THEN 2
  WHEN 'House and Garden' THEN 2
  WHEN 'The Terrible Trio' THEN 2
  WHEN 'Harlequinade' THEN 2
  WHEN 'Time Out of Joint' THEN 2
  WHEN 'Catwalk' THEN 2
  WHEN 'Bane' THEN 2
  WHEN 'Baby-Doll' THEN 2
  WHEN 'The Lion and The Unicorn' THEN 2
  WHEN 'Showdown' THEN 2
  WHEN 'Riddler''s Reform' THEN 2
  WHEN 'Second Chance' THEN 2
  WHEN 'Harley''s Holiday' THEN 2
  WHEN 'Lock-Up' THEN 2
  WHEN 'Make ''Em Laugh' THEN 2
  WHEN 'Deep Freeze' THEN 2
  WHEN 'Batgirl Returns' THEN 2
  ELSE season_number END,
    episode_number = CASE title
  WHEN 'On Leather Wings' THEN 1
  WHEN 'Christmas with The Joker' THEN 2
  WHEN 'Nothing to Fear' THEN 3
  WHEN 'The Last Laugh' THEN 4
  WHEN 'Pretty Poison' THEN 5
  WHEN 'The Underdwellers' THEN 6
  WHEN 'P.O.V' THEN 7
  WHEN 'Forgotten' THEN 8
  WHEN 'Be a Clown' THEN 9
  WHEN 'Two-Face, Part 1' THEN 10
  WHEN 'Two-Face, Part 2' THEN 11
  WHEN 'It''s Never Too Late' THEN 12
  WHEN 'I''ve Got Batman in My Basement' THEN 13
  WHEN 'Heart of Ice' THEN 14
  WHEN 'The Cat and The Claw, Part 1' THEN 15
  WHEN 'The Cat and The Claw, Part 2' THEN 16
  WHEN 'See No Evil' THEN 17
  WHEN 'Beware The Gray Ghost' THEN 18
  WHEN 'Prophecy of Doom' THEN 19
  WHEN 'Feat of Clay, Part 1' THEN 20
  WHEN 'Feat of Clay, Part 2' THEN 21
  WHEN 'Joker''s Favor' THEN 22
  WHEN 'Vendetta' THEN 23
  WHEN 'Fear of Victory' THEN 24
  WHEN 'The Clock King' THEN 25
  WHEN 'Appointment in Crime Alley' THEN 26
  WHEN 'Mad As A Hatter' THEN 27
  WHEN 'Dreams in Darkness' THEN 28
  WHEN 'Eternal Youth' THEN 29
  WHEN 'Perchance to Dream' THEN 30
  WHEN 'The Cape and Cowl Conspiracy' THEN 31
  WHEN 'Robin''s Reckoning, Part 1' THEN 32
  WHEN 'Robin''s Reckoning, Part 2' THEN 33
  WHEN 'The Laughing Fish' THEN 34
  WHEN 'Night of The Ninja' THEN 35
  WHEN 'Cat Scratch Fever' THEN 36
  WHEN 'The Strange Secret of Bruce Wayne' THEN 37
  WHEN 'Heart of Steel, Part 1' THEN 38
  WHEN 'Heart of Steel, Part 2' THEN 39
  WHEN 'If You''re So Smart, Why Aren''t You Rich' THEN 40
  WHEN 'Joker''s Wild' THEN 41
  WHEN 'Tyger, Tyger' THEN 42
  WHEN 'Moon of the Wolf' THEN 43
  WHEN 'Day of The Samurai' THEN 44
  WHEN 'Terror in the Sky' THEN 45
  WHEN 'Almost Got ''Im' THEN 46
  WHEN 'Birds of a Feather' THEN 47
  WHEN 'What Is Reality' THEN 48
  WHEN 'I Am The Night' THEN 49
  WHEN 'Off Balance' THEN 50
  WHEN 'The Man Who Killed Batman' THEN 51
  WHEN 'Mudslide' THEN 52
  WHEN 'Paging The Crime Doctor' THEN 53
  WHEN 'Zatanna' THEN 54
  WHEN 'The Mechanic' THEN 55
  WHEN 'Harley and Ivy' THEN 56
  WHEN 'Shadow of The Bat, Part 1' THEN 57
  WHEN 'Shadow of The Bat, Part 2' THEN 58
  WHEN 'Blind as a Batman' THEN 59
  WHEN 'The Demon''s Quest, Part 1' THEN 60
  WHEN 'The Demon''s Quest, Part 2' THEN 61
  WHEN 'His Silicon Soul' THEN 62
  WHEN 'Fire From Olympus' THEN 63
  WHEN 'Read My Lips' THEN 64
  WHEN 'The Worry Men' THEN 65
  WHEN 'Sideshow' THEN 1
  WHEN 'A Bullet for Bullock' THEN 2
  WHEN 'Trial' THEN 3
  WHEN 'Avatar' THEN 4
  WHEN 'House and Garden' THEN 5
  WHEN 'The Terrible Trio' THEN 6
  WHEN 'Harlequinade' THEN 7
  WHEN 'Time Out of Joint' THEN 8
  WHEN 'Catwalk' THEN 9
  WHEN 'Bane' THEN 10
  WHEN 'Baby-Doll' THEN 11
  WHEN 'The Lion and The Unicorn' THEN 12
  WHEN 'Showdown' THEN 13
  WHEN 'Riddler''s Reform' THEN 14
  WHEN 'Second Chance' THEN 15
  WHEN 'Harley''s Holiday' THEN 16
  WHEN 'Lock-Up' THEN 17
  WHEN 'Make ''Em Laugh' THEN 18
  WHEN 'Deep Freeze' THEN 19
  WHEN 'Batgirl Returns' THEN 20
  ELSE episode_number END
WHERE series_id = 'batman-the-animated-series';

