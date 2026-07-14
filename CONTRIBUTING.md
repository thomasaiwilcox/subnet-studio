# Contributing to Subnet Studio

Thank you for helping make subnetting easier to understand. Contributions can include calculation fixes, accessibility improvements, teaching content, browser compatibility, documentation, tests, and focused product enhancements.

## Before opening a change

- Search existing issues to avoid duplicate work.
- Use the CIDR correctness issue form for any suspected arithmetic or state-invariant defect.
- Discuss large UI changes, new provider behaviour, IPv6, or persistence-format changes in an issue before implementation.
- Keep pull requests focused. Unrelated refactoring makes correctness review harder.

## Local setup

Use Node.js 22 or later.

```sh
npm ci
npx playwright install
npm run check
npm run test:e2e:ci
```

Run `npm run dev` while developing. The editable entry point is `src/index.html`; the root `index.html` is a generated, tracked release artifact.

## Engineering principles

1. **Correctness before convenience.** State must remain canonical, aligned, non-overlapping, complete, and provider-valid.
2. **Transactions are atomic.** A failed split, join, allocation, plan, profile change, or import must leave the workspace and history untouched.
3. **Previews are transient.** Planning and history previews must not affect autosave, exports, share links, or committed history.
4. **User content is text.** Never pass labels or imported values to `innerHTML`. Build safe DOM nodes or use `textContent`.
5. **Offline means offline.** Do not introduce runtime network requests, hosted fonts, telemetry, remote scripts, or required accounts.
6. **Accessibility is a feature.** Preserve keyboard operation, focus, ARIA relationships, touch targets, mobile layouts, and reduced-motion behaviour.
7. **Explain failures.** Invalid actions should return a precise, useful reason rather than silently doing nothing.

The detailed model invariants and module map are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests

Add tests at the narrowest useful level:

- Unit tests for CIDR arithmetic, provider rules, transformations, planning, persistence, history, scenarios, analysis, and report safety.
- Playwright tests for behaviour spanning UI and domain boundaries.
- Visual snapshots only for intentional, stable publication states.

Every pull request should pass:

```sh
npm run check
npm run test:e2e:ci
```

If you intentionally change a reviewed visual state, update snapshots on macOS and include before/after images in the pull request:

```sh
npm run test:visual -- --update-snapshots
```

Do not weaken an assertion merely to make a test pass. For correctness fixes, include a regression test that fails without the change.

## Style and scope

- Follow the existing strict TypeScript style and system-font visual language.
- Prefer small pure functions for domain logic and DOM construction for presentation.
- Avoid new production dependencies unless they materially reduce risk or complexity.
- Keep schema-v1 workspace JSON and share links backward compatible unless a reviewed migration plan says otherwise.
- Do not edit `downloaded-site/index.html`; it is an untouched historical reference.

## Pull requests

Describe the user-visible outcome, implementation approach, tests run, and any compatibility implications. Include screenshots or a short recording for visible UI changes. A maintainer may ask for a smaller change if a pull request combines unrelated concerns.

By contributing, you agree that your contribution is licensed under the project's MIT Licence.
