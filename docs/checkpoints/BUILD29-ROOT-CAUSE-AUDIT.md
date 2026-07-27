# Build 29 Root-Cause Audit — Window, Workspace, and Page System

GITHUB_EMBARGO_STATUS: ACTIVE  
PROJECT_STATUS: IN PROGRESS — NOT FINAL  
Target identity: Airmonlink Composer 1.1.9 Build 29

## Baseline inspected

Read-only source baseline: `ktheagent/Airmonlink-4`, branch `main`, Build 28.

## Confirmed root causes

1. **Incorrect physical-page dimensions.** Build 28 styles define `.paper,.solfa-sheet` as `width:1120px; min-height:780px`. A portrait A-series page needs a height approximately 1.414 times its width; the current minimum height is approximately 0.696 times the width. The default page is therefore landscape-like and visually resembles a half page.

2. **Transform-only zoom.** Build 28 applies `transform:scale(...)` directly to pages. CSS transforms alter painting but do not resize the layout box or scroll geometry.

3. **Incomplete transform compensation.** The code changes only `marginBottom`, and for zoom below 100% the calculated negative compensation is clamped to 28px. The original unscaled width and height continue controlling layout, which creates dead space, detached pages, incorrect scroll extents, and misleading page positioning.

4. **One unpaginated Staff SVG.** Staff rendering calculates a single SVG height from every system and places it inside one `.paper`. The Staff view therefore has no physical-page casting and can become one arbitrarily tall pseudo-page.

5. **Different Staff and Sol-fa page worlds.** Sol-fa creates multiple `<article class="solfa-sheet">` elements, while Staff uses one `.paper`. Their pagination, dimensions, headers, and page numbering are not owned by one service.

6. **Forced Sol-fa width.** `.solfa-workspace{min-width:max-content}` can force horizontal overflow even when Fit Width is selected.

7. **Insufficient reflow observation.** Build 28 listens only for `window.resize`. It has no `ResizeObserver` for the workspace, ribbon, inspector, piano dock, page-setting changes, or other layout-affecting elements.

8. **Fit Page measures an unpaginated content box.** The Staff page height grows with the entire SVG. Fit Page can therefore shrink a long score as one object instead of fitting one physical page.

## Corrective architecture

Build 29 must use one `ViewportLayoutService` that owns:

- physical page specifications;
- usable workspace measurements;
- fit-width, fit-page, actual-size, and custom zoom;
- scaled layout boxes that match painted dimensions;
- continuous, single-page, spread, and horizontal page modes;
- Staff, Sol-fa, parts, preview, PDF, and image page geometry;
- current-page calculation;
- scroll-anchor preservation;
- reflow after window, dock, ribbon, view, page, and display changes.

## Regression protection created

`test/v119-viewport-layout-service.test.js` checks:

- full portrait page aspect ratio;
- orientation;
- 1366×768 Fit Width;
- 1920×1080 Fit Page;
- no double application of Windows scaling;
- scaled layout-box geometry;
- continuous and spread page placement;
- scroll-anchor preservation;
- one-service recomputation.

## Status

Root cause: VERIFIED COMPLETE  
Regression service prototype: IMPLEMENTED AND LOCALLY TESTABLE  
Integration into complete Build 28 source: BLOCKED UNTIL THE COMPLETE BASELINE IS MOUNTED LOCALLY  
Windows visual matrix: NOT TESTED  
Build 29 checkpoint: NOT YET CREATED
