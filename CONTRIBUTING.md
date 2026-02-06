# Contributing to rpckit

Thank you for your interest in contributing to rpckit!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mainnet-pat/rpckit.git
   cd rpckit
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Build all packages:
   ```bash
   yarn build
   ```

4. Run tests:
   ```bash
   yarn test
   ```

## Project Structure

```
rpckit/
├── packages/
│   ├── core/        # Core types, BatchScheduler, parse utilities
│   ├── websocket/   # WebSocket transport
│   ├── tcp/         # TCP transport (Node.js)
│   ├── http/        # HTTP transport
│   ├── fallback/    # Fallback meta-transport
│   └── cluster/     # Cluster meta-transport
├── tests/           # Test files
└── site/            # Documentation site (Vocs)
```

## Commands

| Command | Description |
|---------|-------------|
| `yarn build` | Build all packages |
| `yarn test` | Run all tests |
| `yarn test --run` | Run tests without watch mode |
| `yarn tsc --noEmit` | Type check |
| `yarn biome check .` | Lint |
| `yarn biome check --write .` | Fix lint/format issues |

## Making Changes

1. Create a branch for your changes
2. Make your changes
3. Ensure tests pass: `yarn test --run`
4. Ensure types pass: `yarn tsc --noEmit`
5. Ensure lint passes: `yarn biome check .`
6. Submit a pull request

## Adding a New Transport

1. Create a new package in `packages/`
2. Implement the `Transport` interface from `@rpckit/core`
3. Add protocol-specific variants in a subpath (e.g., `/electrum-cash`, `/ethereum`)
4. Add tests in `tests/`
5. Update documentation

## Code Style

- TypeScript with strict mode
- Biome for linting and formatting
- No semicolons (configured in Biome)
- Single quotes for strings

## Testing

- Unit tests use Vitest with mocked transports
- Integration tests in `tests/mainnet.test.ts` run against live servers (skipped in CI)
- Reference tests compare behavior against other libraries

## Questions?

Feel free to open an issue for questions or discussions.
