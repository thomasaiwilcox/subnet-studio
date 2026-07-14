# Releasing

Subnet Studio uses semantic versions and keeps the application version in `package.json`. The UI reads that value at build time.

## Prepare a release

1. Move relevant entries from `Unreleased` in `CHANGELOG.md` into a dated version section.
2. Update the version without creating a tag:

   ```sh
   npm version <major|minor|patch> --no-git-tag-version
   ```

3. Run the complete local verification:

   ```sh
   npm run check
   npm run test:e2e:ci
   ```

4. Inspect `dist/index.html` offline and confirm the root `index.html` and `social-preview.png` were refreshed.
5. Commit the version, lockfile, changelog, source, tests, and generated root artifacts together.

## Publish a release

Create and push a tag that exactly matches the package version:

```sh
git tag v2.0.0
git push origin v2.0.0
```

The release workflow validates the tag against `package.json`, runs the full fast check, and creates a GitHub release with `dist/index.html` and `dist/social-preview.png` attached. It will not publish an npm package.

If the workflow fails, correct the underlying commit and create a new version. Do not move a published release tag.

## Static deployment

The GitHub release and the canonical website are separate publication targets. Deploy the two files from `dist/` to the static host path. The HTML must continue to work independently when opened locally; the social preview image is not a runtime dependency.
