# King Videos

## Project Goal

Build a private family media streaming platform for personal videos and media.

The platform will provide a custom streaming interface accessible from Roku TVs, iPads, iPhones, and web browsers.

---

# Technology Stack

| Component | Selection |
|---|---|
| Media Storage | **Backblaze B2** |
| Backend / API | **Cloudflare Workers** |
| Database | **Cloudflare D1** |
| Authentication | **Clerk** |
| PWA | **React + JavaScript + Vite** |
| PWA Hosting | **GitHub Pages** |
| Source Control | **GitHub** |
| CI/CD | **GitHub Actions** |
| Infrastructure as Code | **Pulumi + TypeScript** |
| Media Management | **Backblaze B2 CLI** |
| Domain | **GitHub Pages URL initially** |
| Roku | **SceneGraph + BrightScript** |
| Video Standard | **TBD / Multiple formats initially** |

---

# Architecture

```text
                         KING VIDEOS

                     GitHub Repository
                            │
                     GitHub Actions
                            │
                   ┌────────┴────────┐
                   │                 │
                Pulumi          GitHub Pages
                   │              React PWA
                   │                 │
             Cloudflare              │
          ┌────────┴───────┐         │
          │                │         │
       Workers             D1        │
         API            Database     │
          │                │         │
          └────────┬───────┘         │
                   │                 │
                   └────────┬────────┘
                            │
                      Backblaze B2
                       king-videos/
                            │
                  ┌─────────┴─────────┐
                  │                   │
               Roku App          PWA / Browser
```

---

# Media Storage

## Backblaze B2

Backblaze B2 is the primary media storage provider.

Bucket:

```text
king-videos/
```

Initial directory structure:

```text
king-videos/
└── movies/
    └── [movie-name]/
        ├── file.[mp3/m4a/mkv/mov/avi/webm]
        └── thumb.[jpg/png/gif]
```

Example:

```text
king-videos/
└── movies/
    ├── christmas-2025/
    │   ├── file.mp4
    │   └── thumb.jpg
    │
    ├── disney-vacation-2026/
    │   ├── file.mov
    │   └── thumb.png
    │
    └── baseball-2026/
        ├── file.mkv
        └── thumb.jpg
```

The B2 bucket should remain **private**.

Clients should never contain permanent B2 credentials.

---

# Media Management

## Backblaze B2 CLI

Most media management will initially be performed through the command line rather than an administrative web interface.

Typical workflow:

```text
Local Media
    ↓
B2 CLI
    ↓
king-videos/movies/[movie-name]/
```

The CLI can be used for:

- Uploading movies
- Uploading thumbnails
- Replacing media
- Listing files
- Synchronizing folders
- Removing media

An administrative UI can be added later if useful.

---

# Backend

## Cloudflare Workers

Cloudflare Workers provides the King Videos API.

Responsibilities:

- Authentication validation
- Media catalog
- Profiles
- Categories
- Search
- Favorites
- Recently Added
- Continue Watching
- Playback progress
- B2 media authorization

Potential API:

```text
GET  /api/home
GET  /api/library
GET  /api/media/:id
GET  /api/categories
GET  /api/search
GET  /api/profiles

GET  /api/progress/:profile
POST /api/progress

POST /api/media/:id/play
```

The playback endpoint authorizes access before allowing the client to retrieve private media from B2.

---

# Database

## Cloudflare D1

D1 contains application data and metadata.

Stores:

- Users
- Profiles
- Media metadata
- Categories
- Favorites
- Watch history
- Playback positions
- Permissions

Actual media files remain in B2.

---

# Authentication

## Clerk

Clerk handles account authentication.

Initial model:

```text
King Videos Account
       │
       ├── Dad
       ├── Mom
       ├── Gabbi
       ├── Liam
       └── Kids
```

Clerk handles authentication while King Videos manages individual viewing profiles.

Potential future features:

- Profile PINs
- Kids profiles
- Content restrictions
- Device authorization

---

# PWA

## React + JavaScript + Vite

The primary web client will be a React PWA.

Hosted using:

```text
https://jacobuid.github.io/king-videos/
```

Primary devices:

- iPad
- iPhone
- Desktop
- Laptop

Users can add the PWA to their iPad/iPhone Home Screen for an app-like experience.

### Features

- Profile selection
- Home
- Continue Watching
- Recently Added
- Categories
- Search
- Favorites
- Movie details
- Video playback
- Resume playback
- Full-screen playback

Future:

- Offline downloads / Trip Mode

---

# Roku Application

## SceneGraph + BrightScript

The Roku application will use the same API and media library as the PWA.

```text
Roku
  ↓
Cloudflare Worker
  ↓
Authentication / D1
  ↓
Authorized B2 Media
```

Features:

- Profile selection
- Home
- Cover artwork
- Categories
- Continue Watching
- Recently Added
- Search
- Favorites
- Details
- Playback
- Resume playback

---

# Infrastructure as Code

## Pulumi + TypeScript

Infrastructure will be defined in TypeScript and stored in GitHub.

Pulumi will manage supported infrastructure including:

- Cloudflare Workers
- Cloudflare D1
- Cloudflare configuration
- Backblaze B2 resources
- Environment configuration
- Secrets/references

---

# Repository Structure

Proposed monorepo:

```text
king-videos/
├── apps/
│   ├── web/
│   │   └── React PWA
│   │
│   └── roku/
│       └── Roku Application
│
├── services/
│   └── api/
│       └── Cloudflare Worker
│
├── infrastructure/
│   └── pulumi/
│
├── scripts/
│   └── Media/B2 utilities
│
├── .github/
│   └── workflows/
│
└── package.json
```

---

# CI/CD

## GitHub Actions

Application and infrastructure deployments originate from GitHub.

```text
git push
   ↓
GitHub
   ↓
GitHub Actions
   │
   ├── Build React/Vite
   │        ↓
   │   GitHub Pages
   │
   └── Pulumi
            ↓
       Cloudflare / B2
```

Initial environments:

```text
Development
Production
```

---

# Security

- Private B2 bucket
- HTTPS
- Clerk authentication
- No B2 credentials inside PWA/Roku clients
- Short-lived media authorization
- Server-side authorization
- Admin permissions
- Secrets excluded from Git
- GitHub Actions secrets where required

---

# Cost Goal

Target:

**Approximately $0–$10/month**

Expected primary recurring cost:

**Backblaze B2 storage**

Expected to remain free or near-free initially:

- GitHub
- GitHub Pages
- GitHub Actions
- Cloudflare Workers
- Cloudflare D1
- Clerk
- Pulumi

---

# Development Plan

## Phase 1 — Infrastructure

- Create GitHub repository
- Create Pulumi project
- Configure Cloudflare
- Create Worker
- Create D1 database
- Create private B2 bucket
- Configure Clerk
- Configure GitHub Actions
- Deploy basic infrastructure

## Phase 2 — Media

- Install/configure B2 CLI
- Establish `king-videos/` media structure
- Upload test movies
- Upload thumbnails
- Create media metadata model
- Connect D1 catalog to B2 media

## Phase 3 — PWA

- Create React/Vite application
- Configure GitHub Pages
- Add PWA functionality
- Authentication
- Profiles
- Home
- Library
- Movie details
- Playback
- Continue Watching

At this point, **King Videos should be usable on the family's iPads.**

## Phase 4 — Roku

- Roku developer environment
- Roku API client
- Profiles
- Home UI
- Library
- Movie details
- B2 playback
- Progress synchronization

## Phase 5 — Advanced

- Offline downloads
- Automatic thumbnails
- TV shows / seasons / episodes
- Parental controls
- HLS
- Automatic video conversion
- Improved CLI media tooling
- Optional Admin UI