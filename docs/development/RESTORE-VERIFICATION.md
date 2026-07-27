# Build 27 Clean-Restore Verification

GITHUB_EMBARGO_STATUS: ACTIVE

Product: Airmonlink Composer 3  
Version: 1.1.7  
Build: 27  
Source archive SHA-256 verified: `e7423b75ddfffa3ac89f1ef6d395b746972ec67ba759188722cb1d3f003d64bf`

## Archive checks

- External SHA-256: PASS.
- ZIP integrity (`ZipFile.testzip`): PASS.
- Archive entries: 121.
- Expected project root: `Airmonlink-Composer-1.1.7-Build27/`.
- ZIP itself excluded from the restored source tree: PASS.

## Dependency restoration

- `npm ci --ignore-scripts --no-audit --no-fund`: **BLOCKED** by repeated HTTP 503 responses from the configured npm registry.
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: **BLOCKED** because `yocto-queue@0.1.0` was not available in the local npm cache.
- Clean dependency installation is **not verified**.

Detailed evidence: `validation/dependency-restore.log`.

## Dependency-independent restored-source validation

- `npm run lint`: PASS — 57 JavaScript files.
- `npm test`: PASS — 187/187 tests.
- `npm run performance`: PASS — 6/6 gates.
  - 100000-measure-lookups: 20.527 ms / 2000 ms limit.
  - airscore-serialize: 21.422 ms / 2500 ms limit.
  - airscore-deserialize: 17.963 ms / 3500 ms limit.
  - musicxml-export: 34.886 ms / 5000 ms limit.
  - layout-plan: 25.773 ms / 4000 ms limit.
  - rapid-semantic-entry: 3283.272 ms / 8000 ms limit.
- `npm run preview`: PASS.
- `npm run browser-smoke`: PASS — 45/45 checks.
- Browser screenshot, Sol-fa screenshot, and browser-generated PDF were produced.

## Not verified

- Electron dependency post-installation.
- Production Electron launch.
- Windows x64 packaging.
- NSIS installer.
- Portable Windows executable.
- PE metadata.
- Installation, upgrade, file association, and uninstall.
- Human Windows visual review.
- Independent PDF/PNG visual review.
- Physical audio, MIDI, and printer testing.
- Code signing.

## Result

Build 27 is reproducible for dependency-independent source, performance, preview, and browser validation. It is **not** a completed production checkpoint because clean dependency restoration is blocked.

## Exact next development action

Create Version 1.1.8 Build 28 only after a reachable npm registry or complete compatible npm cache is available; then perform clean dependency installation, Electron packaging, Windows artifact validation, release-candidate audit, and the Best-Version Exit Gate.
