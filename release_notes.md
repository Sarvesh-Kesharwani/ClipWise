# ClipWise - Release Notes

## v1.1.0 - Remix, Cloud Sync, and Deployment Update (2026-04-12)

### Highlights

- Added Google Drive cloud sync for ClipWise data, including saved videos, instances, watch counts, and summaries.
- Added dashboard folders and drag-and-drop organization for videos.
- Added Watch Mix so users can create saved remix groups from clips pulled across multiple videos.
- Added a dedicated remix player that now behaves like the normal clip player, including clip colors, summary editing, summary locking, and progress updates to the original source clips.
- Added Vercel deployment routing config for production hosting.

---

### New Features

#### Google Drive Cloud Sync

- Sign in with Google to save ClipWise data into the app's private Google Drive app-data storage.
- Added manual save and load actions, plus automatic sync after local changes.
- Added token refresh handling and automatic sign-in restore on page load when possible.
- Moved cloud sync controls into the top-right area of the dashboard for quicker access.

#### Dashboard Organization

- Added folders on the dashboard so videos can be grouped by topic or workflow.
- Added folder creation, renaming, deletion, and drag-and-drop video moves.
- Added per-folder progress bars based on watched clip progress.

#### Watch Mix / Remix

- Added a `Watch Mix` flow on the dashboard.
- Users can create a saved mix from clips selected randomly across multiple source videos.
- The mix modal now shows all videos, allows multi-select, and clearly marks videos that are not clip-ready yet.
- Saved mixes appear in a dedicated `Remix` section on the dashboard.
- Remix cards show watched and summarized progress derived from the original source clips.

#### Remix Player

- Added a dedicated remix player route for saved mixes.
- Remix clips now behave like normal clip groups:
  - clip colors match watch/summary state
  - summary edit button appears when available
  - current watched-unsummarized clip locks later clips until a summary is saved
  - progress updates write back to the original source instance clip
- Remix groups now remain stable after playback instead of removing clips after completion.

#### Player Experience

- Added a current-clip progress bar below playback so users can see how much of the active clip has been completed.
- Added a completion celebration effect when a clip is fully watched.
- Updated clip buttons to a more tactile, Duolingo-inspired 3D style.

---

### Deployment

- Added `vercel.json` SPA rewrite support so route-based navigation works correctly on Vercel deployments.

---

## v1.0.0 - Initial Release (2026-04-10)

### Overview

ClipWise is a web app for structured video watching and progress tracking. It breaks long videos into manageable, fixed-length clips and tracks your progress clip by clip.

---

### New Features

#### Video Sources

- **Local video files**: Pick video files from your computer (MP4, WebM, MKV, etc.) via a file picker. Files are stored in the browser's IndexedDB for persistence across sessions.
- **YouTube videos**: Paste any YouTube URL to add a video. Title and thumbnail are fetched automatically.

#### Video Instances

- Create multiple tracking instances per video, each with its own clip size and independent progress.
- Supported clip sizes: 1, 2, 3, 5, 10, and 15 minutes.
- Clip size is immutable once an instance is created — create a new instance for a different size.
- Instance selector modal appears when opening a video from the dashboard.

#### Clip Segmentation

- Videos are automatically split into fixed-length clips based on the chosen clip size.
- The final clip can be shorter if the video duration doesn't divide evenly.
- Clip boundaries are reflected in a custom segmented progress bar.

#### Video Player Page

- YouTube-like layout with a left-side clip panel and main video area.
- Supports both HTML5 native video controls (local files) and YouTube IFrame Player API.
- Custom segmented progress bar with color-coded segments per clip state.
- Clickable progress bar for seeking.
- Playhead indicator with smooth tracking.
- Currently playing clip is highlighted with a pulsing glow effect in the side panel.
- Current clip summary is displayed below the player when available.

#### Watch Tracking Logic

- A clip is marked as "watched" only after 80% of its unique seconds have been played.
- Tracking uses a `WatchTracker` class that records unique watched seconds per clip.
- Seeks and skips (jumps > 3 seconds) are filtered out to prevent false positives.
- Rewatch detection: re-entering a clip resets the tracker, and a new 80% threshold must be met to increment the watch count.

#### Clip Summaries

- After watching a clip, users can add a one-line summary via a modal.
- Summaries can be added or updated at any time after a clip has been watched.
- Summary status is indicated on each clip card.

#### Clip Color States

- **Red** — Not watched
- **Yellow** — Watched once, no summary
- **Green** — Summarized
- **Blue** — Watched 2 times
- **Purple** — Watched 3 or more times
- Watch count badges (e.g., "2x", "3x") provide additional clarity alongside color.
- A color legend is displayed in the clip panel.

#### Dashboard

- Displays all added videos in a responsive grid layout.
- Each video card shows: title, source type badge (Local/YouTube), thumbnail, duration, instance count, progress bar, and watched/summarized stats.
- Empty state with call-to-action for adding the first video.

#### Overall Progress

- Per-instance progress: watched clips / total clips, summarized clips / total clips.
- Dashboard cards aggregate progress across all instances of a video.
- Sidebar in the player page shows an overall progress bar for the active instance.

#### Data Persistence

- All app state (videos, instances, clips, watch counts, summaries) is persisted to `localStorage`.
- Local video files are stored in IndexedDB for cross-session access.

---

### UX / Design

- Duolingo-inspired visual style: bright green (#58CC02) primary theme, rounded UI (12–16px radii), 3D-like buttons with bottom-border depth, soft shadows, and playful typography.
- Animated transitions: modal slide-up, card hover lift, clip pulse glow, loading bar shimmer, spinner.
- Responsive layout with breakpoints at 900px and 640px.

---

### Tech Stack

- React 18 + TypeScript
- Vite 8 (build tooling)
- React Router v6 (client-side routing)
- localStorage + IndexedDB (persistence)
- YouTube IFrame Player API (dynamically loaded)
- CSS custom properties for theming
