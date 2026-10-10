Local import housekeeping (user instruction, 2026-10-09):
- The 2026-10-10 family batch uses scripts/process-family-library.mjs with generated inputs media-imports/oct10-family-definitions.json and logs/oct10-family-scan.json. Progress is logs/oct10-family-status.json. Preserve those inputs, metadata cache and per-title preparation/upload logs while it is running. Rise of the Planet of the Apes is excluded after the replacement failed too. Compatible H.264/HEVC video is copied; AV1/VP9 cartoons use original-resolution H.264 NVIDIA NVENC P7 HQ CQ 12 compatibility conversion, which is high quality but not mathematically lossless. All originals remain; only verified uploaded and published generated MP4s are removed to control disk usage.
- User requested unattended completion overnight. scripts/supervise-family-library.mjs monitors the family queue and resumes failures up to three times from its completed-publication log; supervisor status is logs/oct10-family-supervisor.json. scripts/keep-family-upload-awake.ps1 temporarily prevents idle system sleep while that supervisor lives, allowing display sleep and releasing the power request on exit. Do not run duplicate supervisors or queues.
- User explicitly requested two GPU encodes in parallel after the CPU queue proved too slow, and requested no further benchmarking before switching. Use two NVIDIA RTX 4050 NVENC workers sharing one queue. Family AV1/VP9 conversions use P7 HQ, VBR CQ 12, spatial/temporal AQ, lookahead 32, three B-frames, H.264 High Level 4.1, 10 Mbps maximum/20 Mbps buffer, and passthrough frame timing. Keep original resolution; do not apply the older low-bitrate/downscale defaults below to this batch. Initial CPU output used CRF 12 before the GPU switch. Roku reference: https://developer.roku.com/dev/docs/media . scripts/verify-family-library.mjs audits all 145 expected IDs against live D1/B2 and checks original-file preservation, episode/access metadata and thumbnail hashes.
- Use media-imports/example/media.json as the single tracked movie manifest template. Replace its example fields with verified metadata and real local paths; it is not a real movie to publish. The B2 movie importer also discovers SRT/VTT sidecars in the folder supplied with --folder.
- Local import manifests, generated thumbnails, metadata caches and logs are preparation artifacts, not website runtime dependencies. After a batch finishes successfully, remove its generated artifacts; preserve files needed by running or unfinished jobs until resolved. Do not delete source videos, B2 objects, D1 records, app source, secrets or Roku installation packages as part of repository housekeeping.
- Keep media-imports/quality-references.json as persistent quality memory. Keep generated batch artifacts out of future commits. Historical batch scripts may require a new scan/manifest after their generated inputs have been cleaned.

Quality screening before future movie imports (user instruction, 2026-10-09):
- On 2026-10-10 the user explicitly approved uploading the ten held 720p copies unchanged: King Arthur: Legend of the Sword, Max Steel, National Treasure, National Treasure: Book of Secrets, Pirates of the Caribbean 1–3, Dawn of the Planet of the Apes, War for the Planet of the Apes, and Star Trek Beyond. This exception applies only to these supplied copies; retain quality screening for future files. PG-13 remains 16+; the two National Treasure films are PG.
- Consult media-imports/quality-references.json before approving sources. Iron Man (2008), 1280x544 H.264 at 764,687 bps video, 785,805,683 bytes for 126 minutes, was watched and rejected by the user. It was copied without video re-encoding; preserving an already poor source did not make it acceptable.
- Do not automatically upload similarly low-bitrate HD H.264 sources. Flag approximately 1 Mbps or lower for visual review and obtain the user's decision before uploading those candidates. This is a screening warning, not a universal quality cutoff; do not apply the same bitrate threshold blindly to HEVC/AV1 or use filenames/resolution alone as proof of quality.
- Prefer a better source when the picture is already poor. Upscaling, remuxing or increasing bitrate cannot restore lost source detail. Compare candidate replacements visually in detailed and moving scenes before approving them.
- Preserve original resolution and video quality for acceptable sources. Compress only files demonstrably oversized for their resolution and content; do not apply the older blanket 720p/480p targets below to these blockbuster batches.
- On 2026-10-09 the user authorized the new Iron Man replacement: 1920x800 H.264 at 1,781,421 bps video. Preserve its video without re-encoding, retain catalog metadata and watch history, and delete superseded B2 video versions only after verifying the replacement upload.


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

Movie access ages: PG-13 movies are 16+; R-rated movies are 21+. Apply these ages during imports and rating edits. Other ratings and TV show age settings retain their existing rules. User exceptions (2026-10-10): all PAW Patrol movies and Big Hero 6 (2014) are all ages (min_age 0); Planes (2013) and My Little Pony: The Movie (2017) are 5+. Retain their actual ratings and exclude these titles from the PG/TV-Y7 minimum-age-6 bulk update.

Library thumbnails in B2 must be exactly 1280x720 pixels. Preserve the complete artwork with black padding when its aspect ratio differs. Compress thumbnails (normally WebP quality 80; target around 200 KB) and accept AVIF source images. Profile avatars retain their square format.
