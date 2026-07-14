# Architecture

Subnet Studio is a framework-free TypeScript application built around a pure, canonical IPv4 workspace. The DOM is a projection of state rather than the source of truth.

## State layers

The application has three deliberately separate layers of state:

1. **Committed domain state** is the validated `WorkspaceState` stored in history and autosave.
2. **Transient UI state** contains selection, view transform, menus, dialogs, active lessons, and the exclusive plan/join/history preview.
3. **Display state** is derived from either the active preview or the committed workspace and is rendered by the same map pipeline.

This separation is an important correctness and privacy boundary. A preview can change what the user sees, but it cannot enter history, autosave, exports, share links, or reports until an explicit domain transaction commits it.

## Canonical workspace invariants

Every valid workspace must satisfy all of the following:

- the envelope and every leaf are aligned canonical CIDRs;
- leaves are sorted by network address;
- leaves are non-overlapping and contained by the envelope;
- leaves collectively cover the entire envelope with no gaps;
- every allocation reference points to an existing group;
- every leaf and the envelope satisfy the selected provider's prefix rules;
- strings and custom reservation counts satisfy persistence bounds;
- the rendered leaf count does not exceed 2,048.

Domain operations return an `OperationResult`. A rejected operation returns an explanation and no state. Successful operations produce a new validated state that the UI may commit as one history transaction.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/cidr.ts` | Unsigned IPv4 parsing, canonicalisation, masks, ranges, formatting, sizes, and usable-address behaviour |
| `src/types.ts` | Persisted domain and presentation types |
| `src/profiles.ts` | Provider bounds, labels, reservations, and compatibility validation |
| `src/model.ts` | Workspace creation, validation, split, join, allocation, deallocation, reset, sibling and join-candidate logic |
| `src/planner.ts` | Request parsing, host-to-prefix sizing, and atomic placement algorithms |
| `src/plan-preview.ts` | Exact transient planning state, explanatory steps, and preview metadata |
| `src/history.ts` | Metadata-bearing snapshot history, undo, redo, restoration, and branching |
| `src/persistence.ts` | Zod-validated schema-v1 JSON and compressed URL-safe share state |
| `src/autosave.ts` | Versioned local committed-workspace recovery |
| `src/analysis.ts` | Capacity, reservations, waste, free regions, and group analysis |
| `src/scenarios.ts` | Validated example and challenge workspace construction |
| `src/exporter.ts` | Safe CSV, SVG, and PNG export from canonical leaves |
| `src/report.ts` | Safe offline HTML and Markdown reporting |
| `src/app.ts` | UI controller, rendering, events, dialogs, accessibility, view state, and feature coordination |
| `src/styles.css` | Responsive visual system, themes, touch layouts, and motion preferences |

`src/app.ts` remains the largest coordination module. New domain behaviour should not be added directly to it. Prefer a pure helper or focused feature module, then have the controller bind that behaviour to the interface.

## Transactions and history

History stores immutable workspace snapshots with labels and transaction kinds. The current entry is `present`; `past` and `future` preserve exact undo/redo behaviour. A new transaction clears only the future branch, while restoring a historical entry moves later snapshots into future history.

Address-space changes, imports, scenarios, and Start over intentionally begin new history. Split, join, plan, allocate, deallocate, profile change, and reset are single transactions.

## Planning

Planning is largest-first and atomic. All requests are parsed, sized with provider reservations, and preflighted against capacity, profile constraints, and the leaf limit before a state is offered. The UI commits the exact state stored by a successful `PlanPreview`; it never recalculates on Apply.

## Persistence and trust boundaries

Workspace JSON and share links persist only `WorkspaceState` schema version 1. They exclude history, autosave metadata, walkthrough completion, active lessons, selection, view transforms, and transient previews.

The persistence parser performs structural validation with Zod and domain validation for alignment, containment, coverage, overlap, group references, provider compatibility, strings, and leaf count. Old unversioned payloads are rejected.

User-provided labels are treated as data. UI and export code uses DOM nodes, `textContent`, escaping, or format-specific inert encoding. Any contribution that introduces an HTML parsing path for user content requires security review.

## Build contract

Vite and `vite-plugin-singlefile` inline production CSS and JavaScript. `scripts/verify-build.mjs` enforces two outputs only:

- `dist/index.html`, containing no external runtime asset request;
- `dist/social-preview.png`, used only by publishing metadata.

The root copies are committed so the application can be inspected or hosted without a build environment. Source changes that affect production should run `npm run build` and include the refreshed root artifact.

## Testing strategy

- Vitest exercises arithmetic and domain invariants without a browser.
- Playwright exercises user workflows in Chromium, Firefox, WebKit, touch profiles, and a 320×568 viewport.
- Visual snapshots cover selected high-value publication states and are reviewed rather than generated automatically on every platform.
- The production verifier checks the deployable artifact rather than assuming bundler configuration is sufficient.

Correctness tests should include unsigned boundaries and the smallest counterexample. Security tests should use hostile labels through every affected export and presentation path.
