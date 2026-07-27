# Airmonlink Composer 3 Requirements Register

Status legend: VERIFIED, PARTIAL, MISSING, BLOCKED, NOT TESTED.

Canonical local base: Airmonlink Composer 1.1.8 Build 28 local source-validated release candidate.

GITHUB_EMBARGO_STATUS: ACTIVE

## Product and architecture

R-001. Deliver a complete production Windows desktop notation application, not a prototype.
R-002. Use one authoritative semantic score model.
R-003. Expose reusable engine logic through a direct Composer 3 API.
R-004. Remove hidden legacy interfaces, controls, bridges, routes, and obsolete workflows.
R-005. Keep exactly four user-facing voice layers across editing, playback, save/load, import/export.
R-006. Preserve working nonvisual engine features while replacing obsolete presentation code.
R-007. Prevent CI from reconstructing or silently replacing canonical source.
R-008. Maintain consecutively increasing semantic development versions after 1.1.0.

## Notation and editing

R-009. Support staff notation with correct pitch, duration, measure, staff, voice, ties, slurs, articulations, and lyrics.
R-010. Support note and rest entry from mouse, keyboard, touch, piano, and MIDI.
R-011. Support selection, multi-selection, copy, paste, delete, transpose, override, and layer operations.
R-012. Support undo and redo for semantic edits.
R-013. Support measures, pickup measures, meter changes, key changes, repeats, and endings.
R-014. Support chords without duplicate pitches or conflicting semantic events.
R-015. Preserve layout edits separately from musical meaning.
R-016. Provide accurate engraving, collision handling, system layout, pagination, and print layout.

## Tonic Sol-fa

R-017. Provide a dedicated printable Tonic Sol-fa page.
R-018. Provide optional synchronized Tonic Sol-fa on staff notation.
R-019. Keep staff notation and Tonic Sol-fa synchronized from the same events.
R-020. Support traditional and modern syllable systems, chromatic syllables, octave marks, rhythm punctuation, rests, bars, and key changes.
R-021. Keep Tonic Sol-fa page zoom separate from notation size, text size, and page dimensions.
R-022. Support multi-page Tonic Sol-fa with stable headers, lyrics, systems, page breaks, and print/export layout.

## Lyrics and text

R-023. Support multiple lyric verses with stable attachment metadata.
R-024. Preserve hyphens, melismas, elisions, Unicode, verse numbers as metadata, and independent offsets.
R-025. Support rapid lyric entry, forward/backward navigation, paste, copy, search, and replace.
R-026. Preserve lyrics across editing, measure insertion, save/load, MusicXML, and Tonic Sol-fa.
R-027. Support editable publication metadata and page-scoped text.

## Playback, MIDI, and audio

R-028. Play from the authoritative score model with accurate tempo, timing, repeats, layers, and loop ranges.
R-029. Provide play, stop, rewind, seek, tempo, metronome, loop, and layer mute/solo controls.
R-030. Support MIDI step-time and real-time input where required.
R-031. Handle absent or failed audio and MIDI devices without crashing.
R-032. Preserve playback meaning when visual layout changes.

## Files, import, export, recovery

R-033. Save and reopen editable `.airscore` projects.
R-034. Detect damaged or unsupported files instead of silently opening them.
R-035. Save atomically, create backups, lock files safely, track recent files, and recover work.
R-036. Import and export MusicXML and compressed MXL.
R-037. Export standard MIDI.
R-038. Export valid PDF and PNG output.
R-039. Print through the Windows desktop workflow.
R-040. Keep all file and export paths synchronized with the authoritative score model.

## Interface, branding, and accessibility

R-041. Use the official navy, royal-blue, white, and gold colour identity.
R-042. Use the official logo and preserve readable white score pages.
R-043. Every visible control must call real functionality directly.
R-044. Provide clear loading, empty, invalid, unsupported, damaged, permission, export, and recovery states.
R-045. Preserve keyboard navigation, visible focus, accessible names, contrast, and scalable UI.
R-046. Ensure panels and docks do not cover the score and restore safely on compact displays.
R-047. Keep page zoom, notation scale, text scale, and print dimensions distinct.

## Windows release and validation

R-048. Build Windows x64 NSIS installer and portable executable.
R-049. Validate generated files as non-empty PE executables with expected version and product metadata.
R-050. Perform bounded startup smoke testing of the portable and installed executable.
R-051. Test silent install and uninstall where supported.
R-052. Test `.airscore` file association when declared.
R-053. Preserve user data during upgrades; report blocked upgrade testing when no prior artifact exists.
R-054. Generate SHA-256 checksums for all distributable artifacts.
R-055. Upload release files and machine-readable validation evidence only after successful validation.
R-056. Never claim code-signing trust without a supplied signing certificate and verified signature.

## Testing, documentation, and completion gates

R-057. Maintain regression tests for every preserved feature before sensitive changes.
R-058. Test absence of legacy DOM elements, hidden controls, and obsolete startup paths.
R-059. Run the full test suite, not only a small clean-shell test subset.
R-060. Include browser/runtime tests for visible workflows and failure states.
R-061. Perform human visual inspection of the compiled Windows interface.
R-062. Validate PDF and PNG output visually in independent viewers.
R-063. Report audio, MIDI, printer, signing, upgrade, and accessibility hardware tests honestly.
R-064. Maintain a traceability matrix linking requirement, implementation, acceptance, automated test, manual test, status, and evidence.
R-065. Perform a final completion audit and self-critique before calling the product complete.
R-066. Do not call the product complete because it launches, builds, or passes a limited test set.

## Current traceability snapshot — Version 0

| Requirement range | Status | Evidence |
|---|---|---|
| R-001–R-008 | VERIFIED FOR FOUNDATION | clean Composer 3 entry, direct API, semantic engine packaged, obsolete renderer physically absent, version advanced to 1.1.1 Build 21 |
| R-009–R-016 | VERIFIED ENGINE BASELINE; UI MATURITY CONTINUES | canonical score model and full regression tests pass |
| R-017–R-022 | VERIFIED ENGINE BASELINE; UI MATURITY CONTINUES | dedicated Sol-fa page and synchronization browser check pass |
| R-023–R-027 | VERIFIED ENGINE BASELINE; UI MATURITY CONTINUES | multi-verse and publication tests pass |
| R-028–R-032 | PARTIAL | playback and MIDI engine tests pass; physical devices not tested |
| R-033–R-040 | PARTIAL | file service, MusicXML/MXL/MIDI/PDF paths pass automated tests; independent visual review continues |
| R-041–R-047 | PARTIAL | official colour identity and browser accessibility checks pass; human Windows visual review not done |
| R-048–R-056 | BLOCKED BY LOCAL PLATFORM | Windows artifacts not yet produced or installed |
| R-057–R-066 | PARTIAL | 146 source tests and 21 browser checks pass; final gate not yet reached |

## Exact next development action

Advance to Version 1.1.2 Build 22 and add explicit notation-core acceptance tests for the clean Composer 3 engine and interface.


## Build 27 restore audit

- R-057–R-060: VERIFIED from clean archive extraction for lint, 187 tests, six performance gates, preview, and 45 browser checks.
- R-048–R-056: NOT VERIFIED. Clean dependency installation is blocked by registry HTTP 503 and an incomplete offline npm cache.
- R-061–R-066: NOT VERIFIED or PARTIAL. Human, hardware, Windows release, signing, and final exit gates remain.


## Build 28 release-candidate audit

- R-057–R-060: VERIFIED COMPLETE for local source — 58-file lint, 193 tests, six performance gates, preview, and 45 browser checks.
- R-048–R-056: NOT IMPLEMENTED or IMPLEMENTED BUT NOT VERIFIED. No Windows artifacts exist.
- Clean dependency installation: IMPLEMENTED BUT NOT VERIFIED because the public registry fails with `EAI_AGAIN` and the offline cache lacks `yocto-queue@0.1.0`.
- R-061–R-066: PARTIAL, NOT VERIFIED, or BLOCKED. The Best-Version Exit Gate has not passed.
