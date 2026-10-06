# King Videos

Private family video catalog. The full plan is in [plan.md](plan.md).

## Local setup

1. Run `npm ci` from the repository root.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and enter the Clerk publishable key and Worker URL.
3. Copy `services/api/.dev.vars.example` to `services/api/.dev.vars` and enter the Clerk and Backblaze keys. Use a bucket-scoped B2 key with read access.
4. Replace the D1 database ID in `services/api/wrangler.jsonc` after creating the database. For local development, run `npx wrangler d1 migrations apply king-videos --local --config services/api/wrangler.jsonc`.
5. Run `npm run dev:web`. The local app can use the deployed API; `http://localhost:5173` is included in the API and media CORS allowlists. Run `npm run dev:api` separately only when changing the Worker itself.

## Cloud setup

The manual `Provision infrastructure` GitHub workflow creates the D1 database with Pulumi, creates the private `king-videos` B2 bucket, configures browser playback CORS, creates a bucket-scoped read key, deploys the Worker, and installs its runtime secrets. It uses the GitHub secrets documented below; generated runtime credentials never enter the repository.

Configure GitHub repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `B2_BOOTSTRAP_KEY_ID`, `B2_BOOTSTRAP_APPLICATION_KEY`, and `PULUMI_ACCESS_TOKEN`. Configure repository variables `VITE_CLERK_PUBLISHABLE_KEY` and, after the first API deployment, `VITE_API_URL`. Enable GitHub Pages with GitHub Actions as the source.

Public Clerk sign-up is restricted to invited or allowlisted users. Apply the same restriction after changing Clerk instances with:

```powershell
node --env-file=.env scripts/configure-clerk-access.mjs
```

Create or invite users from the Clerk Dashboard under **Users**. Existing users can continue signing in after sign-up restrictions are enabled.

Upload videos with the B2 CLI under `movies/<slug>/file.mp4` and thumbnails under `movies/<slug>/thumb.jpg`. Add catalog records using `scripts/add-media.sql.example` and `wrangler d1 execute king-videos --remote --file <your-sql-file> --config services/api/wrangler.jsonc`. The bucket stays private; the API returns short-lived signed URLs after Clerk verification.

Media can use either private Backblaze objects or trusted Internet Archive URLs. Import an Internet Archive folder manifest with the manual `Import media` GitHub workflow. The importer enumerates episode MP4s and streams them from Archive.org while uploading their shared thumbnail to Backblaze.

Private Backblaze media is delivered through signed Cloudflare Worker URLs. The Worker validates the URL before looking in its cache, caches thumbnails at the edge for one year, and proxies video byte-range requests so seeking continues to work without exposing B2 credentials. The web app also uses an image-only service worker with stale-while-revalidate behavior for same-origin profile pictures, logos, and icons. It intentionally never caches HTML, JavaScript, or CSS, preventing stale deployments from referring to deleted hashed bundles. Inspect `X-Kingflix-Cache` (`HIT` or `MISS`) and `X-Kingflix-Delivery` response headers when validating media delivery.

`npm run check` builds the web app and checks the Worker types. The GitHub Pages path is `/king-videos/`, matching the current repository name.

## Current scope

The repository includes the initial web catalog, Clerk sign-in, profile selection, playback, progress writes, D1 schema, B2 signed playback, and deployment workflows. A private Roku SceneGraph app is available in `apps/roku`; see [Roku setup](docs/roku.md) for building, linking, and testing it on a TV.
# Upload a local TV series

Local video folders must be uploaded from the computer that contains the files.

1. Copy `.env.example` to `.env`.
2. Fill in the required credentials. `.env` is ignored by Git and is the local source for Clerk, Cloudflare, Backblaze, Pulumi, and deployment configuration.
3. Run:

   ```powershell
   node --env-file=.env scripts/import-b2-series.mjs media-imports/bluey/media.json --folder "D:\king-videos\bluey-compressed"
   node --env-file=.env scripts/sync-wikipedia-synopses.mjs bluey "List of Bluey episodes"
   ```

The importer skips known duplicate variants, uploads each MP4 to the private Backblaze bucket, and writes its series, season, and episode metadata to D1. It can be run again safely after an interrupted upload. The second command matches uploaded titles to a Wikipedia episode list and refreshes their episode descriptions. For Blue's Clues, run `node --env-file=.env scripts/sync-wikipedia-synopses.mjs blues-clues "List of Blue's Clues episodes"`.

Place English subtitles beside their matching video as either `Video name.en.srt` or `Video name.srt`. The importer converts SRT files to browser-compatible WebVTT. To add subtitles to videos that are already uploaded without uploading the videos again, run:

```powershell
node --env-file=.env scripts/import-b2-series.mjs media-imports/bluey/media.json --folder "D:\king-videos\bluey-compressed" --subtitles-only
```

If an upload stops, resume it without uploading existing Backblaze objects again:

```powershell
node --env-file=.env scripts/import-b2-series.mjs media-imports/bluey/media.json --folder "D:\king-videos\bluey-compressed" --resume
```

For long local uploads, add `--status-file <path>` to write a machine-readable JSON progress snapshot. The file reports total, processed, active, remaining, imported, subtitle, and failure counts and can be monitored while the importer runs.

Compress a local series into a separate resumable output folder before uploading:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compress-series.ps1 -InputFolder D:\king-videos\bluey -OutputFolder D:\king-videos\bluey-compressed
```

Check the active Scooby-Doo compression job and validate every completed output:

```powershell
npm run handbrake:check
```

To check another series, pass its source and output folders after `--`:

```powershell
npm run handbrake:check -- "D:\king-videos\source" "D:\king-videos\compressed"
```

Import a compressed movie and its thumbnail into Backblaze and D1:

```powershell
node --env-file=.env scripts/import-b2-movie.mjs media-imports/sonic-the-hedgehog-ova/media.json --folder "D:\king-videos\sonic-the-hedgehog-ova-compressed"
```

The birthday screen plays the licensed `movies/specials/happy-birthday/happy-birthday.mp4` asset through the authenticated B2 delivery route.
Its multi-color celebration combines [tsParticles Confetti](https://confetti.js.org/) effects inspired by School Pride and Snow with [tsParticles Ribbons](https://ribbons.js.org/).
