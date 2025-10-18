# Contributing to jotai-recoil

Thank you for your interest in contributing to jotai-recoil! This document provides guidelines and instructions for contributing.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/jotai-recoil.git
   cd jotai-recoil
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the library:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Project Structure

```
jotai-recoil/
├── src/
│   ├── atom.ts          # Atom implementation
│   ├── selector.ts      # Selector implementation
│   ├── hooks.ts         # React hooks
│   ├── RecoilRoot.tsx   # Provider component
│   ├── types.ts         # TypeScript types
│   ├── index.ts         # Main entry point
│   └── __tests__/       # Test files
├── examples/            # Example usage
├── dist/                # Built files (generated)
└── package.json
```

## Development Workflow

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and ensure they follow the existing code style

3. Add tests for new functionality

4. Run tests to ensure everything passes:
   ```bash
   npm test
   ```

5. Build the library to check for TypeScript errors:
   ```bash
   npm run build
   ```

### Testing

- Write tests for all new features and bug fixes
- Place tests in `src/__tests__/` directory
- Use descriptive test names
- Follow existing test patterns

Run tests:
```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
```

### Code Style

- Use TypeScript for all code
- Follow existing code formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Use clear and descriptive commit messages:
- `feat: Add support for atom families`
- `fix: Correct selector dependency tracking`
- `docs: Update README with new examples`
- `test: Add tests for useResetRecoilState`

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG.md if the project has one
3. Ensure all tests pass
4. Update documentation for any API changes
5. Submit your pull request with a clear description of the changes

## Reporting Bugs

When reporting bugs, please include:
- A clear description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node version, React version, etc.)

## Feature Requests

Feature requests are welcome! Please:
- Check if the feature already exists or is planned
- Provide a clear use case
- Explain how it would benefit users
- Consider if it fits the library's scope

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
