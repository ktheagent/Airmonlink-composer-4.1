# Build 29 Workspace and Physical-Page Integration Audit

GITHUB_EMBARGO_STATUS: ACTIVE  
PROJECT_STATUS: IN PROGRESS — NOT FINAL  
Application version: 1.1.9  
Build number: 29

## Integrated correction

Build 29 replaces the Build 28 transform-only page workaround with one authoritative
`ViewportLayoutService`. Staff notation and the dedicated Tonic Sol-fa view now render
inside the same physical-page slot system. The service owns paper dimensions, orientation,
margins, Fit Width, Fit Page, Actual Size, custom zoom, scaled layout boxes, continuous,
single-page, spread, and horizontal placement, page navigation, current-page calculation,
scroll-anchor preservation, and reflow after real workspace size changes.

Staff systems are cast into complete physical pages. The first page keeps the publication
header, continuation pages receive compact headers and page numbering, and no musical
system is deliberately split between physical page containers. Sol-fa pages use the same
physical-page classes, dimensions, margins, zoom, placement, and status system.

## Regression protection

- Complete A4 portrait aspect ratio.
- Physical orientation swap.
- Shared printable margin box.
- 1366×768 Fit Width.
- 1920×1080 Fit Page.
- Windows display-scale protection.
- Scaled visual and layout-box agreement.
- Continuous, single, spread, and horizontal layout foundations.
- Scroll-anchor preservation.
- Whole-system Staff page casting.
- Shared Staff and Tonic Sol-fa page-slot structure.
- ResizeObserver and VisualViewport reflow.
- Ctrl-wheel zoom.
- Removal of Build 28 `1120 × 780` and margin-compensation logic.

## Production gates still unavailable or incomplete

- Clean dependency installation on a freshly restored machine: NOT REPEATED FOR BUILD 29.
- Windows x64 installer: NOT BUILT FOR BUILD 29.
- Portable executable: NOT BUILT FOR BUILD 29.
- PE metadata verification: NOT RUN FOR BUILD 29.
- `.airscore` file association: NOT TESTED FOR BUILD 29.
- Installation and uninstall: NOT TESTED FOR BUILD 29.
- Upgrade from Build 28: NOT TESTED.
- Human Windows visual inspection: NOT RUN.
- Independent PDF and PNG visual inspection: NOT RUN.
- Physical audio device test: NOT RUN.
- Physical MIDI device test: NOT RUN.
- Physical printer test: NOT RUN.
- Code signing and Windows trust verification: NOT RUN.
- Best-Version Exit Gate: NOT PASSED.

## Current classification

Build 29 is a local integration checkpoint under active GitHub embargo. Passing source
tests is not proof of Windows packaging, installation, human visual quality, printing,
audio, MIDI, or final release readiness.

## Local validation result

- Syntax validation: PASS - 62 files.
- Automated tests: PASS - 210/210.
- Performance gates: PASS - 6/6.
- Browser interaction checks: PASS - 46/46.
- Viewport matrix: PASS - 28/28 across four scenarios.
- Staff and Tonic Sol-fa visual evidence: generated and inspected.
- PDF render inspection: complete page visible.
- Clean dependency restore: BLOCKED by public npm registry DNS `EAI_AGAIN`.
