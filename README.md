# Airmonlink Composer 3 - Version 1.1.9 Build 29

Airmonlink Composer is a Windows desktop music-composition, staff-notation,
Tonic Sol-fa, playback, MIDI, MusicXML, publishing, and education application.

Build 29 continues the verified Build 28 source. It does not regenerate or replace
the established application.

## Build 29 workspace correction

Build 29 introduces one authoritative physical-page viewport service for:

- A4, A3, A5, Letter, and Legal paper sizes;
- portrait and landscape orientation;
- printable margins and content bounds;
- Staff and dedicated Tonic Sol-fa pages;
- Fit Width, Fit Page, Actual Size, and custom zoom;
- Ctrl + mouse-wheel zoom;
- continuous, single-page, spread, and horizontal page modes;
- current-page status and page navigation;
- scaled layout boxes that match painted page dimensions;
- scroll-anchor preservation;
- reflow after window, dock, ribbon, page, and display-scale changes.

Staff systems are cast onto complete physical pages. The Build 28 `1120 x 780`
half-page geometry, transform-only zoom compensation, forced Sol-fa width, and
desktop-shell expansion defect have been removed.

## Run from source

```text
npm ci
npm start
```

## Full local validation

```text
npm run validate:full
```

The Build 29 source checkpoint passed:

- JavaScript syntax: 62 files;
- automated semantic and integration tests: 210/210;
- performance gates: 6/6;
- browser interaction checks: 46/46;
- viewport matrix: 28/28 across four window/display-scale scenarios;
- preview generation;
- Staff and Tonic Sol-fa screenshots;
- one-page PDF generation and visual render inspection.

## Release classification

**LOCAL WORKSPACE-INTEGRATION CHECKPOINT - NOT FINAL**

The public npm registry was unreachable from the checkpoint environment
(`EAI_AGAIN`), so a clean Build 29 dependency installation and Windows packaging
were not performed locally. Windows Setup, Portable, installation, upgrade,
uninstall, file association, signing, human Windows review, and physical audio,
MIDI, and printer testing remain required.

`GITHUB_EMBARGO_STATUS: ACTIVE`
