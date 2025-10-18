# Publishing jotai-recoil to npm

## Pre-publishing Checklist

✅ **All checks passing:**
- Build: `npm run build` - ✅ Success
- Tests: `npm test` - ✅ 9/9 tests passing
- TypeScript: `npm run typecheck` - ✅ No errors

## Quick Publish Guide

### 1. Update package.json metadata

Before publishing, update these fields in `package.json`:

```json
{
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/jotai-recoil"
  }
}
```

### 2. Initialize Git repository

```bash
git init
git add .
git commit -m "Initial release: jotai-recoil v0.1.0"
```

### 3. Create GitHub repository

1. Go to https://github.com/new
2. Create a repository named `jotai-recoil`
3. Push your code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/jotai-recoil.git
git branch -M main
git push -u origin main
```

### 4. Publish to npm

```bash
# Login to npm (first time only)
npm login

# Verify everything builds
npm run build
npm test

# Publish!
npm publish
```

### 5. Install in your project

Once published, you can install it in your projects:

```bash
npm install jotai-recoil jotai
```

Then simply change your imports from:
```tsx
import { atom, useRecoilState } from 'recoil';
```

To:
```tsx
import { atom, useRecoilState } from 'jotai-recoil';
```

## Publishing Updates

When making updates:

```bash
# Make your changes
# Run tests
npm test

# Update version
npm version patch  # 0.1.0 -> 0.1.1
# or
npm version minor  # 0.1.0 -> 0.2.0

# Build and publish
npm run build
npm publish

# Push to git
git push && git push --tags
```

## Package Stats

- **Bundle size**: ~3.5 KB (minified)
- **TypeScript**: Full type definitions included
- **Formats**: CommonJS + ESM
- **Dependencies**: Only peer deps (jotai, react)

## What's Included

- ✅ `atom()` - Create Recoil-style atoms
- ✅ `selector()` - Create derived state
- ✅ `useRecoilState()` - Read and write atom values
- ✅ `useRecoilValue()` - Read atom values
- ✅ `useSetRecoilState()` - Write atom values
- ✅ `useResetRecoilState()` - Reset to default values
- ✅ `RecoilRoot` - Provider component
- ✅ Full TypeScript support
- ✅ 9 passing tests

## Known Limitations

- Atom effects not fully implemented (shows warning)
- `initializeState` in RecoilRoot shows warning
- Snapshots API not available

These are documented in the README.md
