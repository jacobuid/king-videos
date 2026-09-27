Purpose is to get the new movies in D:\king-videos uploaded to backblaze B2.

Handbrake Compression Configuration:
- Use two NVIDIA GPU NVENC Workers sharing one queue
- Scan the input folder.
- Exclude duplicates and episode-zero files when requested.
- Skip valid completed outputs.
- Place remaining files into one shared queue.
- Start two HandBrake processes.
- Give each process the next available file.
- Validate each output before removing its .partial suffix.
- Record worker, filename, progress, speed, failures, and estimated remaining time.
- Finish only when both workers are idle and the queue is empty.
- Leave failed videos in a failure list without stopping the other worker.
- Temporary files: write as .partial.mp4, then rename after successful validation

BEFORE BEGINNING
1. Check if ratio is 16:9 or 4:3
    - If 16:9, target resolution is 720p
    - If 4:3, target resolution is 480p (older classic tv or movie)
2. Pre-check: Check if videos are already optimized/compressed.
    - If already optimized/compressed good; report ratio, resolution, before/after file size and recommendation. -> Pause
    - If not optimized/compressed, compress 1 test video and report result. For most videos i wan it to be 720p, but some older ones can be 480p.
3. Start Compression
    - Audio: 96 kbps AAC minimal
    - Video: 680 kbps NVENC minimal


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