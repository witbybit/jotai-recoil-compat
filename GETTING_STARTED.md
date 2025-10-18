# Getting Started with jotai-recoil

This guide will help you set up and publish your jotai-recoil library.

## Initial Setup

### 1. Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit: jotai-recoil library"
```

### 2. Create GitHub Repository

1. Go to GitHub and create a new repository named `jotai-recoil`
2. Link your local repository:

```bash
git remote add origin https://github.com/yourusername/jotai-recoil.git
git branch -M main
git push -u origin main
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build the Library

```bash
npm run build
```

This will create the `dist/` directory with:
- `index.js` - CommonJS bundle
- `index.mjs` - ES Module bundle
- `index.d.ts` - TypeScript type definitions

### 5. Run Tests

```bash
npm test
```

## Publishing to npm

### First Time Setup

1. Create an npm account if you don't have one: https://www.npmjs.com/signup

2. Login to npm:
   ```bash
   npm login
   ```

3. Update package.json with your information:
   - Change `author` field
   - Update `repository.url` with your GitHub URL
   - Verify package name is available on npm

### Publishing

1. Ensure everything is built and tested:
   ```bash
   npm run build
   npm test
   ```

2. Update version (if needed):
   ```bash
   npm version patch  # 0.1.0 -> 0.1.1
   # or
   npm version minor  # 0.1.0 -> 0.2.0
   # or
   npm version major  # 0.1.0 -> 1.0.0
   ```

3. Publish to npm:
   ```bash
   npm publish
   ```

### Publishing Beta/Alpha Versions

For testing before official release:

```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

Users can install with:
```bash
npm install jotai-recoil@beta
```

## Development Workflow

### During Development

1. Make changes to source files in `src/`
2. Run in watch mode:
   ```bash
   npm run dev
   ```
3. Test your changes:
   ```bash
   npm run test:watch
   ```

### Before Committing

1. Run type checking:
   ```bash
   npm run typecheck
   ```

2. Ensure tests pass:
   ```bash
   npm test
   ```

3. Build successfully:
   ```bash
   npm run build
   ```

## Using Locally Before Publishing

To test the library in your project before publishing:

### Option 1: npm link

In the jotai-recoil directory:
```bash
npm run build
npm link
```

In your project directory:
```bash
npm link jotai-recoil
```

### Option 2: Direct file reference

In your project's package.json:
```json
{
  "dependencies": {
    "jotai-recoil": "file:../path/to/jotai-recoil"
  }
}
```

Then run:
```bash
npm install
```

## Project Scripts

- `npm run build` - Build the library for production
- `npm run dev` - Build in watch mode for development
- `npm test` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run typecheck` - Run TypeScript type checking
- `npm run prepublishOnly` - Automatically builds before publishing

## Next Steps

1. **Add CI/CD**: Set up GitHub Actions for automated testing
2. **Documentation**: Add more examples and API documentation
3. **Type Testing**: Add type-level tests
4. **Bundle Size**: Monitor and optimize bundle size
5. **Compatibility**: Test with different React versions
6. **Advanced Features**: Implement atom effects, snapshots, etc.

## Migrating Your Existing Project

Once published, migrate your Recoil project:

1. Install jotai-recoil:
   ```bash
   npm install jotai-recoil jotai
   ```

2. Replace imports:
   ```tsx
   // Before
   import { atom, useRecoilState } from 'recoil';
   
   // After
   import { atom, useRecoilState } from 'jotai-recoil';
   ```

3. Test thoroughly

4. Gradually migrate to native Jotai if desired

## Troubleshooting

### Build Issues

If you encounter build errors:
```bash
rm -rf dist node_modules
npm install
npm run build
```

### Type Errors

Ensure TypeScript is properly configured:
```bash
npm run typecheck
```

### Test Failures

Check if dependencies are correctly installed:
```bash
npm install
npm test
```

## Support

- Open issues on GitHub for bugs or feature requests
- Check existing issues before creating new ones
- Provide minimal reproduction examples

## Resources

- [Jotai Documentation](https://jotai.org/)
- [Recoil Documentation](https://recoiljs.org/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
