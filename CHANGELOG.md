# Changelog

All notable changes to Subnet Studio are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public repository documentation, community health files, CI, and release automation.

## [2.0.0] - 2026-07-14

### Added

- Canonical, validated IPv4 workspace model with `/0`–`/32` correctness.
- Proportional binary subnet map with direct split, allocation, deallocation, sibling, and partial-join actions.
- Atomic VLSM planning previews and the step-by-step Subnet Coach.
- Provider profiles for Azure, AWS, GCP, and custom reservations.
- Snapshot history, timeline previews, exact undo/redo branching, and local autosave recovery.
- Guided lessons, prefix playground, six scenarios, analysis, inventory, and first-run walkthrough.
- Safe JSON and share-link persistence plus HTML, Markdown, SVG, PNG, CSV, and print exports.
- Responsive pointer, touch, keyboard, reduced-motion, light, and dark interfaces.
- Fully offline single-file production build and social preview artwork.

### Changed

- Rebuilt the historical prototype as a maintainable vanilla TypeScript and Vite application.

### Security

- User labels are rendered as text, imported workspaces are validated, and production contains no external runtime assets or telemetry.
