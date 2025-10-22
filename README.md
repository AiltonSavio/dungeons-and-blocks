# Dungeons and Blocks

## Overview

Dungeons and Blocks is a Solana-based dungeon crawler where on-chain programs mint dungeon layouts and hero collectibles, and a Phaser/Vite client renders playable runs in the browser. The project couples Anchor programs (`dungeon-nft`, `hero-core`) with a pixel-art front end that consumes the same deterministic dungeon data stored on-chain. The result is a game loop where explorers acquire heroes, mint dungeons, and traverse them in real time with synced state.

Key ideas:

- *Deterministic content*: Dungeon layouts, doors, chests, and portals are derived directly from on-chain `DungeonMint` accounts. The client never generates conflicting maps.
- *Composable programs*: The Anchor workspace includes a dungeon NFT minter and a hero core program. Each program exposes instructions that the Phaser client and off-chain scripts call.
- *Modern tooling*: The UI is built with Vite, Phaser 3, and TypeScript. Anchor drives program builds, deployment, and local validator scripts.

## Features

- Anchor programs for dungeon minting (`dungeon-nft`) and hero lifecycle (`hero-core`).
- Phaser-powered dungeon explorer with party management, minimap, stress HUD, portals, and loot interactions.
- Deterministic dungeon hydration from on-chain accounts, including rooms, corridors, doors, chests, and portals.
- Town and embark scenes for hero selection and dungeon launching.
- Vite + Yarn 4 monorepo with workspace separation for web and on-chain code.
- Ready-to-run Anchor scripts, including a dungeon config initializer.

## Tech Stack

- **Solana / Anchor**: On-chain programs, IDL generation, workspace scripts.
- **Rust**: Program implementation.
- **TypeScript**: Front-end logic and Anchor client utilities.
- **Phaser 3**: Game rendering and scene management.
- **Vite**: Dev server and build pipeline for the Phaser app.
- **Vitest**: Unit testing for client utilities.
- **Yarn 4 workspaces**: Monorepo package management.

## Folder Structure

```
├── AGENTS.md                  # Repository guidelines for contributors
├── Anchor.toml                # Anchor workspace configuration
├── app/                       # Phaser/Vite client workspace
│   ├── package.json           # Client-specific scripts
│   ├── src/
│   │   ├── scenes/            # Phaser scenes (Game, Town, Embark, etc.)
│   │   ├── dungeon/           # Dungeon grid helpers & deterministic derivations
│   │   ├── state/             # Solana account state managers (dungeonChain, heroChain)
│   │   └── ui/                # UI components (inventory, stress panel, tooltips)
│   └── vite.config.ts         # Vite configuration tuned for Phaser
├── migrations/                # Anchor deployment scripts
├── programs/                  # Anchor on-chain crates
│   ├── dungeon-nft/           # Dungeon minting program (logic.rs, state.rs)
│   └── hero-core/             # Hero collection & progression program
├── scripts/                   # Node scripts (e.g., init-dungeon-config.js)
├── target/                    # Anchor build artifacts & generated IDLs/types
├── tests/                     # Anchor + ts-mocha integration tests & fixtures
├── package.json               # Monorepo scripts and shared dev tooling
└── yarn.lock                  # Locked dependencies for all workspaces
```

## Installation & Setup

1. **Prerequisites**
   - Node.js ≥ 18
   - Yarn 4 (the repo uses `yarn@4.9.2`)
   - Rust toolchain (`rustup` recommended)
   - Solana CLI
   - Anchor CLI (`cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked`)

2. **Clone & Install**
   ```bash
   git clone <repository-url>
   cd dungeons-and-blocks
   yarn install
   ```

3. **Environment**
   - Ensure the Solana CLI is configured with the correct cluster and keypair (`solana config get`).
   - Anchor reads provider settings from `Anchor.toml`. Update `provider.wallet` if your keypair lives elsewhere.

4. **Build Anchor Programs**
   ```bash
   anchor build
   ```

5. **Generate Front-End Types (optional but recommended)**
   Anchor build emits updated IDLs and type definitions under `target/`. The Phaser client uses these in `app/src/types`.

## Development

### Yarn workspace scripts (root `package.json`)

| Script         | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `yarn app:dev` | Runs the Phaser client dev server (`yarn workspace app dev`).               |
| `yarn app:build` | Type-checks and builds the Phaser client (`yarn workspace app build`).    |
| `yarn app:preview` | Serves the last production build locally for QA (`yarn workspace app preview`). |
| `yarn app:test` | Executes client unit tests via Vitest (`yarn workspace app test`).         |
| `yarn lint`    | Runs Prettier in check mode across the monorepo.                            |
| `yarn lint:fix` | Formats the repo using Prettier.                                            |

### Client workspace scripts (`app/package.json`)

| Script      | Description                                      |
| ----------- | ------------------------------------------------ |
| `yarn dev`  | Vite dev server for Phaser.                      |
| `yarn build`| Type-check (`tsc`) then build with Vite.         |
| `yarn preview` | Preview the production build.                |
| `yarn test` | Run client tests with Vitest.                    |

### Running the Game Locally

```bash
yarn app:dev
# open http://localhost:5173/
```

The client expects on-chain dungeon data. You can:

- Connect to devnet/localnet where `dungeon-nft` and `hero-core` are deployed (addresses in `Anchor.toml`).
- Use `anchor run init-dungeon-config` to seed initial dungeon config data (see below).
- Provide a fallback run (the scene will build a sandbox dungeon if no on-chain dungeon resolves).

## Anchor Workflow

This project relies on standard Anchor tooling plus a custom initializer script:

### `anchor build`

Compiles all programs under `programs/` and generates updated IDLs/types under `target/`. Run this whenever Rust program code changes.

```bash
anchor build
```

### `anchor deploy`

Deploys the compiled artifacts to the cluster defined in `Anchor.toml` (`[provider]` section). Ensure your wallet has sufficient SOL and the `programs.<cluster>` IDs match the deployed addresses if you’re upgrading.

```bash
anchor deploy
```

### `anchor run init-dungeon-config`

Executes the custom script declared in `Anchor.toml` under `[scripts]`. `scripts/init-dungeon-config.js` seeds the `dungeon-nft` config account with initial parameters (collection metadata, grid dimensions, etc.).

```bash
anchor run init-dungeon-config
```

You can rerun the script to adjust config values; it uses Anchor’s provider settings for signer and cluster.

## Deployment

1. **Build programs**
   ```bash
   anchor build
   ```
2. **Deploy programs to target cluster**
   ```bash
   anchor deploy
   ```
3. **Bootstrap dungeon config**
   ```bash
   anchor run init-dungeon-config
   ```
4. **Build the client**
   ```bash
   yarn app:build
   ```
5. **Serve static assets**  
   The build outputs to `app/dist`. Host the content using any static web server or integrate into your preferred deployment pipeline. Ensure client environment variables (e.g., `VITE_SOLANA_RPC_URL`) target the cluster where the programs are deployed.

## License

No explicit license is bundled with this repository. All rights are reserved by the authors. Contact the maintainers for usage or distribution questions.
