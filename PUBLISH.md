# Publishing

1. Make sure everything passes:

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

2. Update `CHANGELOG.md` and bump the version:

   ```bash
   npm version minor   # or patch / major
   ```

3. Publish (the `prepublishOnly` script runs the typecheck, tests and build again):

   ```bash
   npm publish
   git push && git push --tags
   ```

The published package contains `dist/` (CJS, ESM and type definitions), the `bin/` CLI, `README.md`, `MIGRATION.md` and `LICENSE`. Check the contents with `npm pack --dry-run` before publishing.

When the major or minor version changes, update the alias examples in `README.md` and `MIGRATION.md` (`npm:jotai-recoil-compat@^x.y.z`).
