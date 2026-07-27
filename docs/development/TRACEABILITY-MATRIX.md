# Traceability Matrix — 1.1.8 Build 28

GITHUB_EMBARGO_STATUS: ACTIVE

| Requirement | Evidence | Status |
|---|---|---|
| R-002–R-047 | canonical source, 193 tests, browser and performance evidence | VERIFIED BY AUTOMATED LOCAL TESTS; INSTALLED/MANUAL GATES REMAIN |
| R-048–R-056 | Windows installer, portable executable, PE metadata, install/upgrade/uninstall, checksums, signing | NOT IMPLEMENTED OR NOT VERIFIED |
| R-057–R-060 | 58-file lint, 193 tests, six performance gates, 45 browser checks | VERIFIED COMPLETE FOR LOCAL SOURCE |
| R-061–R-063 | human Windows visual inspection, independent PDF/PNG inspection, physical audio/MIDI/printer tests | NOT VERIFIED |
| R-064–R-066 | traceability, final completion audit, Best-Version Exit Gate | PARTIALLY IMPLEMENTED — FINAL GATE NOT PASSED |

## Current blocking evidence

- Public npm registry DNS: `EAI_AGAIN`.
- Offline npm cache: `ENOTCACHED` for `yocto-queue@0.1.0`.
- No Build 28 Windows artifacts exist.
