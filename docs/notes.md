
Purpose is to get the new movies encoded and uploaded to backblaze B2.

Movie story genres come from the title and year matched IMDb title dataset, using its supplied genres (up to three). Do not guess additional story genres or truncate metadata during sync. Keep IMDb IDs and source URLs in manifests. Map IMDb `Sci-Fi` to `Science Fiction`, `Sport` to `Sports`, and its `Animation` to the reviewed 3D/2D classification below. `Classic` remains a separate KINGFLIX classification.

KINGFLIX genre definitions: `Animation` is for 3D animation; `Cartoon` is for 2D animation. Classify hybrid titles by their main animation style and preserve other genre tags. Documentary featurettes use `Documentary`.

`Classic` replaces `Classic Television` and applies to non-animated movies and TV shows released before 1990. Titles tagged `Animation` or `Cartoon` do not qualify.

`Home Videos` is a content type (`home-videos`), not a genre. Home-video manifests use an empty genres list unless other actual genres are assigned.

**IMPORTANT** - Ask user for directory where movies are.

Handbrake encoding Configuration:
- Use two NVIDIA GPU NVENC Workers sharing one queue
- Scan the input folder.
- Exclude duplicates and call make user aware of any special episodes or movies in input folder
- Skip valid completed outputs.
- Place remaining files into one shared queue.
- Start two HandBrake processes.
- Give each process the next available file.
- Validate each output before removing its .partial suffix.
- Record worker, filename, progress, speed, failures, and estimated remaining time.
- Finish only when both workers are idle and the queue is empty.
- Leave failed videos in a failure list without stopping the other worker.
- Temporary files: write as .partial.mp4, then rename after successful validation
- Place Temporary files in "C:\Users\jacob\Downloads\KINGFLIX\"

BEFORE BEGINNING
1. Check if ratio is 16:9 or 4:3
    - If 16:9, target resolution is 720p
    - If 4:3, target resolution is 480p (older classic tv or movie)
2. Pre-check: Check if videos are already optimized/compressed.
    - If already optimized/compressed good; report ratio, resolution, before/after file size and recommendation. -> Pause
    - If not optimized/compressed, compress 1 test video and report result. For most videos i wan it to be 720p, but some older ones can be 480p.
3. Start Compression
    If the episodes are 4:3 old standard definition, I recommend:
    - Resolution: 480p
    - Video: H.264 NVENC at 1,100 kbps
    - Audio: AAC at 96 kbps
    - Workers: Two parallel NVENC workers
    If the sources are genuinely 16:9 HD:
    - Resolution: 720p
    - Video: H.264 NVENC at 1,600 kbps
    - Audio: AAC at 96–128 kbps

--------------------------------------------------------------

Parallel Backblaze B2 deployment configuration
- Use two local node importer processes (3 upload workers each)
- three upload workers: 3
- Source: Completed, validated compressed folder
- Destination: The series or movie prefix inside the king-videos B2 bucket
- Resume: Enabled
- Existing files: Skip when their remote size matches
- Retries: Retry temporary failures with increasing delays
- Credentials: Read from the repository .env

1. Start Deploy compressed videos to B2.
2. Check [wikipedia link] for meta data and update/create `media.json`.
3. check in and push.

Note: B2 upload can be running in bakground while you are creating metadata and checking that in.

Movie access ages: PG-13 movies are 16+; R-rated movies are 21+. Apply these ages during imports and rating edits. Other ratings and TV show age settings retain their existing rules.

Library thumbnails in B2 must be exactly 1280x720 pixels. Preserve the complete artwork with black padding when its aspect ratio differs. Compress thumbnails (normally WebP quality 80; target around 200 KB) and accept AVIF source images. Profile avatars retain their square format.
