# Local Validation Report - 1.1.9 Build 29

GITHUB_EMBARGO_STATUS: ACTIVE

## Passed

- Build 28 source checksum verification: PASS.
- `npm run lint`: PASS - 62 JavaScript files.
- `npm test`: PASS - 210/210.
- `npm run performance`: PASS - 6/6.
- `npm run preview`: PASS.
- `npm run browser-smoke`: PASS - 46/46.
- `npm run viewport-matrix`: PASS - 28/28 across four scenarios.
- Desktop-shell containment: PASS.
- Staff physical-page geometry: PASS.
- Dedicated Tonic Sol-fa physical-page geometry: PASS.
- Fit Width and Fit Page geometry: PASS.
- Continuous, single-page, spread, and horizontal layout foundations: PASS.
- 100%, 125%, and 150% display-scale scenarios: PASS.
- PDF generation: PASS.
- PDF render inspection: PASS - complete page visible.
- Legacy production paths absent: PASS.
- GitHub embargo: ACTIVE; no Build 29 repository write performed.

## Failed or blocked

- `npm ping --registry=https://registry.npmjs.org/`: FAIL - `EAI_AGAIN`.
- Clean Build 29 `npm ci`: NOT RUN because registry resolution failed.
- Build 29 Electron production launch from clean dependencies: NOT RUN.
- Build 29 Windows packaging: NOT RUN.
- Setup, Portable, PE metadata, installation, file association, upgrade,
  uninstall, signing, hardware, and human Windows visual tests: NOT RUN.

## Evidence

- `validation/build29-full-validation.log`
- `validation/performance-report.json`
- `validation/browser-smoke.json`
- `validation/build29-viewport-matrix.json`
- `validation/composer3-browser.png`
- `validation/composer3-solfa.png`
- `validation/composer3-print.pdf`
- `validation/build29-npm-registry.log`
