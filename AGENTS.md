# Repository Guidelines

## Project Structure & Module Organization

- `programs/` contains the Anchor on-chain crates (`dungeons-and-blocks`, `hero-core`); shared Solana types belong in `src/lib.rs` for each program.
- `app/` is the Phaser client built with Vite; UI utilities live under `app/src/ui`, state managers in `app/src/state`, and scenes in `app/src/scenes`.
- `migrations/deploy.ts` wires Anchor deployments; extend this when adding programs or accounts.
- `docs/` hosts gameplay and integration notes, and `tests/fixtures/` provides local validator snapshots referenced by `Anchor.toml`. The full documentation for magicblock is in `docs/magicblock/`.

## Build, Test, and Development Commands

```bash
yarn app:dev        # run Vite + Phaser locally
yarn app:build      # type-check and emit static assets to app/dist
anchor build        # compile all programs in programs/
anchor test         # spin up the configured localnet and run ts-mocha tests
```

Use `yarn lint` / `yarn lint:fix` before submitting UI changes.

## Coding Style & Naming Conventions

- TypeScript files use 2-space indents, ES module imports, and prefer `camelCase` for functions/state keys (`app/src/state/heroStats.ts` is the reference).
- Component-style modules export defaults when consumed by Phaser scenes; helper utilities export named functions.
- Rust programs follow standard Rustfmt defaults (4-space indents); run `cargo fmt` inside each program directory.
- Keep on-chain account structs and instruction handlers colocated; mint new modules rather than large `lib.rs` blocks to preserve clarity.

## Testing Guidelines

- Web logic relies on `vitest`; place new unit specs next to the source with a `.test.ts` suffix and run `yarn app:test`.
- Anchor integration suites live under `tests/` and run through `ts-mocha` via `anchor test`; create files such as `tests/new_feature.test.ts`, and load fixtures from `tests/fixtures/`.
- Aim for deterministic tests: seed RNG-dependent systems and clean up created accounts.

## Commit & Pull Request Guidelines

- Follow concise, imperative commit subjects (e.g., `add hero inventory sync`) and group related changes; the existing history uses single-line summaries with optional context after a colon.
- PRs should include: purpose overview, testing evidence (`yarn app:test`, `anchor test`, screenshots for UI), and any configuration changes. Link Solana addresses or transaction logs when relevant.
- Highlight migration or deployment impacts in the PR body so maintainers can update `Anchor.toml` or local validator fixtures confidently.
