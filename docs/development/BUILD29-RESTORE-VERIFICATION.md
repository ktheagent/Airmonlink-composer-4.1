# Build 29 Restore Verification

**Product:** Airmonlink Composer 3  
**Version:** 1.1.9  
**Build:** 29  
**Status:** Local source-validated checkpoint; not final  
**GitHub embargo:** Active

## Purpose

This record defines the restore verification for the Build 29 local checkpoint. The
checkpoint must extract with one canonical project folder, retain all required hidden
files, preserve source bytes, and pass the source validation commands from the restored
copy.

## Required restored structure

- `.github/`
- `.gitignore`
- `assets/`
- `docs/`
- `installer/`
- `scripts/`
- `src/`
- `test/`
- `validation/`
- `package.json`
- `package-lock.json`

## Verification commands

```text
node scripts/lint.js
node --test test/*.test.js
```

The final checkpoint archive is also checked against its companion SHA-256 file and
against `docs/checkpoints/BUILD29-CHECKPOINT-MANIFEST.json`.

## Scope limit

Restore verification confirms archive integrity and source-level reproducibility only.
It does not confirm dependency restoration, Electron startup, Windows compilation,
installation, signing, printing, audio, MIDI, or physical-device behaviour.

Generated: 2026-07-26T23:58:24+00:00
