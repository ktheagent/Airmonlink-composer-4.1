# Airmonlink Composer 3 - 1.1.9 Build 29 Checkpoint Notes

## Purpose

Build 29 repairs the Build 28 window, workspace, page-canvas, scaling, scrolling,
and disconnected Staff/Tonic Sol-fa page systems. It is a local development
checkpoint, not a final production release.

## Integrated changes

The application now uses one physical-page service for paper dimensions,
orientation, margins, zoom, page placement, page count, navigation, and scroll
position. Staff and Tonic Sol-fa use the same page slots, paper boundaries,
workspace background, zoom calculations, and layout modes.

The score workspace no longer relies on a fixed `1120 x 780` pseudo-page or
vertical margin compensation after CSS transforms. Each painted page has a
matching scaled layout box, so scroll extents and visible page boundaries remain
connected.

Staff notation is cast by complete systems into physical pages. Continuation
pages include compact headers and page numbers. Tonic Sol-fa retains its
dedicated first-class view while sharing the page service.

The desktop shell is width-contained so oversized ribbon groups scroll within
the ribbon rather than widening the application window and pushing the score
off-screen.

## Validation completed

- 62 JavaScript files passed syntax validation.
- 210/210 automated tests passed.
- 6/6 performance gates passed.
- 46/46 browser interaction checks passed.
- 28/28 viewport matrix checks passed across four scenarios.
- Staff and Tonic Sol-fa screenshots were generated and inspected.
- PDF output was generated, rendered to PNG, and inspected as a complete page.

## Still required

Build 29 has not been compiled into Windows Setup or Portable executables.
Installation, startup, `.airscore` association, upgrade, uninstall, signing,
human Windows visual review, and physical audio, MIDI, and printer tests have
not been performed.

The local public npm registry check failed with `EAI_AGAIN`, preventing a clean
dependency restore in this environment.

`GITHUB_EMBARGO_STATUS: ACTIVE`
