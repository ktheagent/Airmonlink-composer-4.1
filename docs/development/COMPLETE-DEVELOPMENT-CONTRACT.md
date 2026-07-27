# AIRMONTLINK COMPOSER 3 — COMPLETE DEVELOPMENT CONTRACT

You are responsible for building **Airmonlink Composer 3** as a complete, professional, production-ready Windows desktop music-composition and notation application—not a basic prototype, demonstration, starter template, UI mock-up, partially working MVP, or renamed copy of an obsolete version.

This contract governs the entire project. Read it together with every previous Airmonlink Composer 3 requirement. If an earlier instruction describes a feature in greater detail, preserve that detail in the requirements register instead of shortening or silently omitting it.

## 1. Interpret “Complete” Correctly

A complete Airmonlink Composer 3 means:

* Every requested feature is implemented end-to-end.
* Every visible button, menu, toolbar command, keyboard shortcut, panel, dialog, setting, workflow, and navigation item performs its real intended function.
* The interface is connected directly to genuine notation, playback, editing, file, export, and printing logic.
* The application uses one authoritative semantic score model.
* Staff notation, Tonic Sol-fa, playback, lyrics, piano input, MIDI, MusicXML/MXL, PDF, printing, and `.airscore` files remain synchronized.
* Exactly four user-facing voice layers are supported consistently across editing, playback, saving, loading, importing, and exporting.
* Projects save, reopen, update, recover, import, export, print, and play correctly.
* Loading, empty, invalid-input, unsupported-file, damaged-file, missing-font, audio-device, MIDI-device, export, permission, recovery, and failure states are handled properly.
* Automated tests and genuine production builds pass.
* No requested feature is represented by placeholder text, dummy buttons, fake notation, hard-coded sample data, TODO comments, “coming soon” screens, hidden old controls, simulated functionality, or misleading completion claims.

Do not report the application as complete merely because it launches, compiles, displays a score, produces a green workflow, or passes a small number of tests.

## 2. Begin With a Full Requirements Register

Before changing the source:

1. Read the entire request, all previous Composer instructions, project-memory files, completion prompts, repository documentation, issues, workflows, and test reports.
2. Inspect the existing repository, branches, tags, commits, application source, tests, packaging, and release artifacts.
3. Identify the newest genuinely verified canonical checkpoint.
4. Extract every requirement into one numbered requirements register.
5. Include notation, Tonic Sol-fa, lyrics, playback, MIDI, MusicXML, files, printing, publishing, interface, accessibility, performance, Windows packaging, testing, documentation, and migration requirements.
6. Identify conflicting, unclear, duplicate, obsolete, or missing requirements.
7. Create a traceability matrix connecting every requirement to:

   * Planned implementation
   * Relevant files or modules
   * Acceptance criteria
   * Automated test
   * Manual or visual verification
   * Current status
   * Evidence or verified commit

8. Preserve every already-working feature and add regression tests before changing sensitive code.
9. Never silently omit a requirement because it is difficult.

The requirements register becomes the authoritative completion checklist.

## 3. Establish One Clean Canonical Architecture

Airmonlink Composer 3 must have one clean production architecture.

Preserve verified nonvisual engine logic where it remains correct, but expose it through a direct, documented Composer 3 engine API. Commands such as save, undo, redo, play, stop, note input, lyric entry, import, export, print, and PDF generation must call the real engine directly.

Remove permanently:

* Hidden old interfaces
* Hidden legacy controls
* Legacy command bridges
* Obsolete navigation and startup routes
* Old toolbars and layouts
* Composer 2 workflows
* Temporary source-migration workflows
* Duplicate score models
* Dead, abandoned, and conflicting production files
* Code that reconstructs or silently replaces the canonical source during CI

Add tests proving the new interface operates without legacy DOM elements, hidden controls, or old startup paths.

Do not delete working engine functionality merely because the old interface is being removed. Separate reusable engine logic from obsolete presentation logic, test it, and connect it directly to the new Composer 3 interface.

## 4. Use One Authoritative Semantic Score Model

The same underlying musical events must power:

* Staff notation
* The dedicated Tonic Sol-fa page
* Optional synchronized Tonic Sol-fa on the staff
* Lyrics
* Playback
* Piano, mouse, touch, keyboard, and MIDI input
* Undo and redo
* Copy, paste, override, and layer operations
* `.airscore` saving and reopening
* MusicXML and compressed MXL import/export
* PDF generation and printing

Do not maintain conflicting independent staff and Tonic Sol-fa documents.

Every event must preserve the musical information needed for correct pitch, onset, duration, measure, staff, voice layer, ties, slurs, articulations, lyrics, playback, saving, and export.

## 5. Build Through Successive Verified Versions

Do not create one superficial version and stop. Develop the same canonical application through these maturity stages.

### Version 0 — Repository Audit and Clean Foundation

* Confirm the canonical repository, branch, source tree, package manager, Electron entry points, build system, and Windows packaging.
* Verify the last known passing baseline before modifying it.
* Establish formatting, linting, test, logging, error-handling, and validation commands.
* Remove obsolete startup and migration paths.
* Connect the clean Composer 3 startup to the direct engine API.
* Prove through tests that old interfaces cannot reappear.

### Version 1 — Complete Notation Core

Implement and verify professional workflows for:

* Score creation and setup
* Instruments and staves
* Clefs, keys, time signatures, measures, barlines, repeats, endings, and system breaks
* Notes, rests, chords, dots, tuplets, ties, slurs, beams, accidentals, articulations, ornaments, dynamics, tempo, rehearsal marks, chord symbols, and techniques
* Selection, note-input mode, Escape behaviour, navigation, editing, dragging, deletion, copy/paste, undo/redo, and keyboard shortcuts
* Exactly four independent user-facing voice layers
* Copying or overriding material across layers
* Automatic same-onset chord creation without duplicate events or false errors

### Version 2 — Accurate Tonic Sol-fa

Keep the dedicated Tonic Sol-fa page. Also provide optional synchronized Tonic Sol-fa on staff notation.

Correct and test:

* Movable-do pitch interpretation
* Key and modulation handling
* Octave marks
* Note and rest duration
* Beat and measure division
* Dots, dashes, underscores, commas, bars, colons, repeats, ties, slurs, and phrase marks
* The exact behaviour of `, . - _ |`
* Lyrics and syllable alignment
* Page, system, measure, and note placement
* Import-to-sol-fa and sol-fa-to-staff conversion
* Editing synchronization in both directions

The Tonic Sol-fa page must remain readable at normal zoom and must not display oversized content that prevents users from seeing the score properly.

### Version 3 — Lyrics, Text, and Publication Layout

Implement complete multi-verse lyric entry with:

* Verse navigation
* Syllable alignment
* Hyphens
* Extenders and melismas
* Editing, selection, copying, deletion, and undo/redo
* Complete verses displayed and printed
* Verse numbers stored as metadata, never appended to lyric text

Support semantic publication fields for:

* Title
* Subtitle
* Dedication
* Composer
* Lyricist
* Arranger
* Composition date
* Copyright
* Source
* Other credits

Required publication hierarchy:

* Large centred title
* Smaller dedication beneath the title
* Key on the left above the time signature
* Composer and date right-aligned above or near the first system
* Complete lyrics placed correctly
* Editable and draggable text
* No text covering another text object, score content, toolbars, menus, panels, or active selection

Support distinct page, header, staff-attached, system-attached, measure-attached, tick-attached, lyric, tempo, rehearsal, chord-symbol, technique, footer, and free-text types.

### Version 4 — Professional Composer 3 Interface

Preserve the official Airmonlink blue-and-gold logo and navy, royal-blue, white, and gold identity.

* Group commands according to musical function.
* Use compact vertical group labels and approximately three related commands per row where appropriate.
* Provide clear selection, input-mode, playback, save, error, and success feedback.
* Make panels tab, split, collapse, or resize according to available space.
* Ensure the right-side bar and panels never cover the staff.
* Support appropriate keyboard navigation, focus, tooltips, contrast, scaling, and accessibility.

The piano input panel must:

* Be hidden by default
* Open from the View menu
* Dock at the bottom
* Resize the score instead of overlaying it
* Collapse and reopen
* Preserve octave and input settings
* Highlight selected and sounding notes
* Support single notes and simultaneous chords
* Support mouse, touch, and MIDI without duplicate input
* Route pitches to the active staff, voice, tick, and duration
* Respect note-input mode
* Record one chord as one undoable operation

### Version 5 — Playback, Files, Import, Export, and Printing

Complete and verify:

* Accurate score playback
* Play, pause, stop, loop, count-in, metronome, tempo, and measure-jump playback
* Instrument sounds, mixer, muting, soloing, and volume controls where required
* MIDI input and output
* MusicXML and compressed MXL round trips
* `.airscore` project persistence and file association
* Autosave, recovery, recent files, and unsaved-change protection
* PDF export
* Professional printing and print preview
* Page size, orientation, margins, spacing, system layout, pagination, manual page breaks, continuation headers, and page numbers
* Fit Width, Fit Page, 100%, manual zoom, and viewport-resize recalculation

Saving and reopening must preserve all musical events, text, lyrics, positions, layers, formatting, page settings, playback settings, and supported import/export data.

### Version 6 — Reliability and Performance

Investigate and correct the slow performance experienced in the compiled Windows application.

Measure and improve:

* Cold and warm startup
* Score rendering and reflow
* Note entry and editing latency
* Playback responsiveness
* Memory and CPU use
* Large-score performance
* Panel opening and resizing
* File opening, saving, import, export, and PDF generation
* Clean shutdown

Test malformed projects, damaged imports, unsupported notation, missing audio or MIDI devices, interrupted saving, read-only locations, large scores, rapid repeated input, and recovery after failure.

### Version 7 — Production Release Candidate

* Conduct a full regression audit against every requirement.
* Run the complete validation suite from a clean dependency installation.
* Produce the genuine Windows x64 installer.
* Verify application identity, version, icon, shortcuts, uninstaller, and `.airscore` association.
* Test clean installation, launch, core workflows, saving, reopening, export, printing, upgrade, and uninstall on Windows where an appropriate environment is available.
* Prepare complete installation, usage, maintenance, recovery, update, and troubleshooting documentation.

Continue through Version 8, Version 9, and further internal revisions whenever any audit still finds incomplete, unreliable, generic, slow, obsolete, simulated, or weak areas.

These are maturity checkpoints, not permission to ship incomplete versions.

## 6. Use Persistent GitHub Checkpoints

At the end of every development stage:

1. Save the completed real source files.
2. Update the requirements register.
3. Update the traceability matrix.
4. Save test commands, results, failures, and evidence.
5. Commit the canonical source directly to GitHub.
6. Push the checkpoint.
7. Confirm that the commit exists remotely.
8. Confirm that validation tested that exact commit.
9. Verify that the checkpoint can be restored and built.
10. Continue from the newest verified checkpoint.

Do not create a false “migration completed” checkpoint before the imported source, resulting commit, startup path, and tests are verified.

Do not use GitHub Actions to reconstruct source bundles, manufacture application files, or silently commit replacements to `main`. CI must validate the committed canonical source.

## 7. Test Functionality, Not Merely Appearance

For every feature, verify:

* The user can find and operate it.
* The control invokes genuine application logic.
* Input produces the correct semantic score event.
* The score displays correctly.
* Playback interprets it correctly.
* Undo and redo restore the correct state.
* Saving and reopening preserve it.
* MusicXML/MXL preserves it where the format supports it.
* PDF and printing display it correctly.
* Invalid operations produce clear feedback without corrupting the score.
* The feature still works after restarting the application.
* Related features continue working after the change.

A screen or toolbar displaying successfully is not evidence that the musical workflow works.

## 8. Mandatory Regression and Validation Suite

Run all applicable:

* Clean dependency installation
* Formatting
* JavaScript syntax checks
* Static analysis and linting
* Unit tests
* Integration tests
* Electron or headless Chromium smoke tests
* Visual layout tests
* Notation input and editing tests
* Chord and four-layer tests
* Lyrics and verse tests
* Tonic Sol-fa parser and layout tests
* Playback tests
* `.airscore` persistence and recovery tests
* MusicXML/MXL round-trip tests
* PDF generation and print-layout tests
* Performance tests
* Startup and shutdown tests
* Windows packaging checks
* Installer tests where a Windows environment is available

Before changing sensitive lyric, chord, layout, playback, parser, or serialization code, add regression tests for the verified existing behaviour.

A green workflow is not sufficient by itself. Inspect what ran, whether dependencies installed, whether tests were discovered, whether assertions executed, and whether the workflow tested the intended commit.

Do not:

* Force a failing command to return success
* Hide failure codes
* Use empty or unreliable status variables
* Skip tests silently
* Weaken assertions merely to obtain green status
* Mark an unavailable test as passed
* Claim physical Windows testing when it did not occur

## 9. Mandatory Completion Audit

Before giving a final result, conduct a line-by-line audit of every requirement.

Use these statuses only:

* VERIFIED COMPLETE
* IMPLEMENTED BUT NOT VERIFIED
* PARTIALLY IMPLEMENTED
* NOT IMPLEMENTED
* BLOCKED BY USER-SUPPLIED ACCESS OR INFORMATION

Report the application as complete only when every mandatory requirement is **VERIFIED COMPLETE**.

“Implemented but not verified” does not count as complete.

If anything is partial, missing, failing, weak, simulated, dependent on legacy controls, or unverified, continue working instead of presenting a final completion report.

## 10. Mandatory Self-Criticism

After each implementation stage, act as a strict independent:

* Music notation software architect
* Composer and arranger
* Tonic Sol-fa specialist
* Desktop application engineer
* Product designer
* Accessibility reviewer
* Performance engineer
* Test engineer
* Windows release engineer
* Real end user

Ask:

* Which musical requirements were overlooked?
* Which buttons only appear functional?
* Which workflows depend on hidden old controls?
* Can old interfaces or obsolete files reappear?
* Are staff, sol-fa, lyrics, playback, files, MIDI, and MusicXML genuinely synchronized?
* Are note, chord, rest, layer, lyric, and punctuation interpretations musically accurate?
* Do realistic and large scores remain usable?
* Is the Tonic Sol-fa page readable and publication-ready?
* Does the interface still look basic or generic?
* Which tests are too shallow?
* Would a professional composer trust the application with important work?
* Can another engineer install, run, test, maintain, and update it?

Record every weakness, correct it, rerun the tests, update the checkpoint, and repeat the audit until no release-blocking weakness remains.

Do not merely describe defects that you have the ability and authorization to fix. Fix them first.

## 11. No False Completion Claims

Never say:

* “The complete application is ready”
* “All features are finished”
* “Production-ready”
* “Fully functional”
* “Everything has been implemented”
* “Migration completed”
* “All tests passed”

unless exact evidence supports the statement.

Do not hide limitations under “foundation,” “scaffold,” “starter,” “proof of concept,” “future enhancement,” or “remaining work can be added later” when a complete application was requested.

If credentials, signing certificates, external devices, paid services, licenses, business decisions, or physical Windows access are genuinely required, identify the exact blocker. Complete and verify everything else that does not depend on it.

## 12. Production Release Gate

Do not provide the final handoff until all applicable checks pass:

* Requirements traceability audit
* Obsolete-code and legacy-interface audit
* Clean dependency installation
* Formatting, syntax, and linting
* Unit, integration, UI, and regression tests
* Score-model integrity tests
* Staff and Tonic Sol-fa synchronization tests
* Lyrics and four-layer tests
* Playback and MIDI tests
* Persistence and recovery tests
* MusicXML/MXL round trips
* PDF and print-layout verification
* Accessibility review
* Performance review
* Clean Windows production build
* Fresh-install and upgrade testing where available
* Startup, core workflow, and shutdown tests
* Artifact checksum verification

Warnings must be investigated. Failures must not be ignored, suppressed, or misrepresented.

## 13. Required Final Handoff

Only after the production release gate passes, provide:

1. Final application version and build number
2. Complete canonical source code
3. Genuine Windows x64 installer and applicable portable artifact
4. Requirements register and traceability matrix
5. Testing report with exact commands and results
6. Implemented-feature register
7. Architecture and engine API documentation
8. Installation and configuration guide
9. User guide
10. Keyboard-shortcut and notation-input guide
11. Tonic Sol-fa guide
12. File-format and import/export guide
13. Backup, recovery, and upgrade instructions
14. Known limitations, if any
15. SHA-256 checksums
16. Exact final-deliverable locations
17. Evidence that obsolete implementations and hidden bridges were removed
18. Clear distinction between verified functionality and anything blocked by unavailable external access

Maintain one canonical full-source package. Increment the version and build correctly. Do not create several conflicting “final” source packages.

## 14. Mandatory Continuous Development Loop

Do not treat completing one version, phase, milestone, interface, workflow, successful test run, green GitHub Actions workflow, or successful build as completion of Airmonlink Composer 3.

After completing each development version, automatically perform this loop:

1. Save all valid completed source changes.
2. Commit the real canonical source.
3. Push the checkpoint to GitHub.
4. Confirm that the exact commit exists remotely.
5. Confirm that validation tested that exact commit.
6. Run all applicable validation, regression, packaging, and release tests.
7. Audit every requirement in the requirements register.
8. Identify incomplete, weak, simulated, unreliable, untested, poorly integrated, slow, or legacy-dependent areas.
9. Correct all discovered problems that can be corrected within the available authority and environment.
10. Add or strengthen regression tests.
11. Rerun the complete applicable validation suite.
12. Update the requirements register, traceability matrix, test report, and project-status file.
13. Criticise the completed stage from the perspectives listed in this contract.
14. Begin the next maturity version immediately.

Do not pause after a successful checkpoint merely to ask whether development should continue.

Do not stop because the interface looks attractive, the application opens, one test suite passes, an installer is generated, or a workflow becomes green.

Do not give a final completion report while any mandatory requirement has any status other than **VERIFIED COMPLETE**.

Continue creating Version 8, Version 9, Version 10, and further maturity versions whenever the audit finds unfinished, basic, weak, slow, unreliable, simulated, unverified, poorly integrated, or legacy-dependent work.

The development loop ends only when:

* Every mandatory requirement is marked **VERIFIED COMPLETE**.
* The complete applicable validation suite passes.
* The canonical Windows production build succeeds.
* The final artifact is verified.
* The legacy-removal audit passes.
* The final self-criticism finds no unresolved release-blocking defect.
* The complete final handoff has been prepared.

## 15. Required Interruption and Resume Protocol

The development AI may sometimes be forced to stop because of a conversation limit, execution-time limit, unavailable tool, lost connection, permission restriction, external dependency, or other unavoidable interruption.

If execution must stop:

1. Do not claim that Airmonlink Composer 3 is complete.
2. Save all valid source changes before stopping.
3. Do not commit broken, fabricated, generated-placeholder, or unverified source merely to create a checkpoint.
4. Create and push a verified GitHub checkpoint when repository access is available.
5. Save the exact:

   * Current maturity version and phase
   * Completed requirements
   * Incomplete requirements
   * Requirement statuses
   * Last verified commit SHA
   * Branch name
   * Tests executed
   * Test results and logs
   * Known failures and warnings
   * Files currently being changed
   * Architecture decisions
   * Remaining legacy-code risks
   * Exact next development action

6. Update the requirements register.
7. Update the traceability matrix.
8. Update the test report.
9. Update the persistent project-status file.
10. Mark the project clearly as **IN PROGRESS — NOT FINAL**.
11. Provide one exact continuation command for the next development session.

Never rely only on conversation memory for resuming development. The repository checkpoint and saved project records are authoritative.

When development resumes:

1. Inspect the repository before changing files.
2. Read the saved requirements register, traceability matrix, test report, and project-status file.
3. Verify the branch and last verified commit.
4. Inspect the current source state and open failures.
5. Confirm that no obsolete source, old interface, or temporary migration workflow has reappeared.
6. Continue from the recorded next action.
7. Do not restart the project.
8. Do not recreate already verified features.
9. Do not return to an obsolete source package.
10. Resume the mandatory development–test–audit–correction loop.

## 16. Exact Continuation Command

Use the following command whenever a new AI session must resume the project:

> Continue Airmonlink Composer 3 from the latest verified GitHub checkpoint. Read the requirements register, traceability matrix, test report and project status first. Do not restart or repeat completed work. Continue the mandatory development loop and do not report final completion until every requirement is VERIFIED COMPLETE.

Treat this continuation command as authorization to resume the already-defined work from the latest verified checkpoint. It is not authorization to discard the canonical architecture, weaken tests, restore legacy interfaces, replace the source with a prototype, or invent completion evidence.

## Final Command

Start by inspecting the existing Airmonlink Composer 3 repository and producing the complete numbered requirements register, architecture audit, legacy-code inventory, test-baseline report, and traceability matrix.

Then develop the same canonical application through every maturity version.

At every checkpoint, save and push the real source, verify the exact commit, run the full applicable validation, criticise the result, correct weaknesses, and continue.

Do not stop at a basic version. Do not rebuild the old interface. Do not rely on hidden legacy controls. Do not report success merely because a workflow is green.

If the work is interrupted, follow the Required Interruption and Resume Protocol. On resumption, apply the Exact Continuation Command and continue from the latest verified GitHub checkpoint without restarting or repeating completed work.

Do not give me the final result until every mandatory Composer 3 requirement has been implemented and independently verified, or until a genuine external blocker requires information or authority that only I can provide.
