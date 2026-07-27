# Build 29 Integrated Workspace Checkpoint

GITHUB_EMBARGO_STATUS: ACTIVE  
PROJECT_STATUS: IN PROGRESS - NOT FINAL  
Version: 1.1.9  
Build: 29

## Baseline

Source baseline:

`Airmonlink-Composer-1.1.8-Build28-Source-Validated-Release-Blocked.zip`

Verified baseline SHA-256:

`7af5063a8c775dccc9d1715e74208b3122d4884f0ab8ad6588c91f84a7566f7d`

## Root causes repaired

1. Fixed `1120 x 780` paper dimensions represented a landscape-like half page.
2. CSS transforms changed painting without changing scroll/layout geometry.
3. Vertical-only margin compensation left incorrect width and dead-space behaviour.
4. Staff notation used one unpaginated SVG.
5. Staff and Tonic Sol-fa used disconnected page worlds.
6. Sol-fa forced `min-width:max-content`.
7. Only `window.resize` triggered fit recalculation.
8. Fit Page measured the growing Staff content box instead of one physical page.
9. Oversized ribbon content widened the entire desktop shell beyond the viewport.

## Integrated correction

- Added `src/composer3/viewport-layout-service.js`.
- Added physical page sizes, orientation, margins, and printable content bounds.
- Added matching visual and scaled layout boxes.
- Added continuous, single-page, spread, and horizontal page modes.
- Added Fit Width, Fit Page, Actual Size, custom zoom, and Ctrl-wheel zoom.
- Added current-page status and previous/next page navigation.
- Added scroll-anchor preservation.
- Added ResizeObserver and VisualViewport reflow.
- Cast Staff systems onto complete physical pages.
- Added Staff continuation headers and page numbers.
- Connected dedicated Tonic Sol-fa pages to the same physical-page system.
- Contained ribbon overflow inside the application shell.
- Preserved the official navy, royal-blue, white, and gold design.

## Validation completed

- Syntax: PASS - 62 JavaScript files.
- Automated tests: PASS - 210/210.
- Performance: PASS - 6/6.
- Browser interactions: PASS - 46/46.
- Viewport matrix: PASS - 28/28.
- Scenarios: 1366x768 and 1920x1080 at 100%, 125%, and 150% display scale.
- Preview generation: PASS.
- Staff screenshot: generated and visually inspected.
- Tonic Sol-fa screenshot: generated and visually inspected.
- PDF: generated, rendered to PNG, and visually inspected as a complete page.
- GitHub writes: NONE.

## Confirmed blocker

Public npm registry DNS resolution failed with `EAI_AGAIN`. A clean dependency
installation and Build 29 Windows packaging were not performed locally.

## Not tested

- Build 29 Setup and Portable executables.
- PE metadata and artifact checksums.
- Windows installation and startup.
- `.airscore` association.
- Upgrade from Build 28.
- Uninstall and user-data preservation.
- Code signing and Windows trust.
- Human Windows visual matrix.
- Physical audio, MIDI, and printer behaviour.
- Final Best-Version Exit Gate.

## Exact next action

On a Windows-capable environment with working npm registry access:

1. Verify the checkpoint archive SHA-256.
2. Extract the complete source.
3. Run `npm ci`.
4. Run `npm run validate:full`.
5. Run `npm run dist:win`.
6. Verify the expected Setup and Portable names.
7. Perform installation, launch, file-association, upgrade, uninstall, visual,
   PDF/PNG, audio, MIDI, printer, and signing checks.
8. Record evidence before considering any GitHub embargo change.

The checkpoint archive checksum is supplied in its external `.sha256` companion
file to avoid a self-referential archive hash.
