# Dungeons and Blocks

## Overview

Dungeons and Blocks is a fully on-chain dungeon crawler built on Solana. It combines four interconnected Anchor programs with a Phaser/Vite client to deliver a decentralized RPG experience. Players mint unique heroes and dungeons as NFTs, manage their economy, and embark on fast, gasless adventures using an ephemeral rollup layer.

The system is designed for composability and scalability, with each program handling a distinct aspect of the game:

- **`dungeon-nft`**: Mints dungeon NFTs with procedurally generated layouts using a verifiable random function (VRF).
- **`hero-core`**: Manages the entire hero lifecycle, from minting and leveling to town services like stress reduction and stat rerolling.
- **`player-economy`**: Governs player gold, persistent item inventories, and shop mechanics.
- **`adventure-engine`**: An ephemeral rollup program (using MagicBlock's Bolt SDK) that manages active dungeon runs with near-instant, gas-free transactions.

Key ideas:

- _Deterministic Content_: Dungeon layouts, doors, chests, and portals are derived directly from on-chain `DungeonMint` and `AdventureSession` accounts. The client never generates conflicting maps.
- _Composable & Upgradable Programs_: The four-program architecture allows for modular development and independent upgrades.
- _Hybrid On-Chain Architecture_: Combines the security of Solana's L1 with the speed and low cost of an ephemeral rollup for a seamless gameplay experience.
- _Modern Tooling_: The UI is built with Vite, Phaser 3, and TypeScript. Anchor drives program builds, deployment, and local validator scripts.

## Features

- **Four interconnected Anchor programs**: `dungeon-nft`, `hero-core`, `player-economy`, and `adventure-engine`.
- **Ephemeral Rollup Gameplay**: Fast, gasless dungeon exploration via MagicBlock's Bolt SDK.
- **Persistent Player Economy**: Manage gold and items that persist across all adventures.
- **Hero Lifecycle Management**: Mint, level up, manage stress, and reroll hero stats.
- **Town Services**: Use the Abbey, Tavern, Sanitarium, and Blacksmith to prepare your heroes.
- **Deterministic Dungeon Generation**: All dungeon layouts are generated on-chain from a seed.
- **Phaser-Powered Client**: A responsive UI for town management, dungeon exploration, and combat.
- **Monorepo with Yarn Workspaces**: Clean separation between on-chain programs and the web client.

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
│   │   ├── state/             # Solana account state managers (dungeonChain, heroChain, etc.)
│   │   └── ui/                # UI components (inventory, stress panel, tooltips)
│   └── vite.config.ts         # Vite configuration tuned for Phaser
├── migrations/                # Anchor deployment scripts
├── programs/                  # Anchor on-chain crates
│   ├── dungeon-nft/           # Dungeon minting program
│   ├── hero-core/             # Hero collection & progression program
│   ├── player-economy/        # Player gold and persistent inventory
│   └── adventure-engine/      # Ephemeral rollup for active adventures
├── scripts/                   # Node scripts (e.g., init-dungeon-config.js)
├── target/                    # Anchor build artifacts & generated IDLs/types
├── tests/                     # Anchor + ts-mocha integration tests & fixtures
├── package.json               # Monorepo scripts and shared dev tooling
└── yarn.lock                  # Locked dependencies for all workspaces
```

## Installation & Setup

1.  **Prerequisites**

    - Node.js ≥ 18
    - Yarn 4 (the repo uses `yarn@4.9.2`)
    - Rust toolchain (`rustup` recommended)
    - Solana CLI
    - Anchor CLI (`cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked`)

2.  **Clone & Install**

    ```bash
    git clone <repository-url>
    cd dungeons-and-blocks
    yarn install
    ```

3.  **Environment**

    - Ensure the Solana CLI is configured with the correct cluster and keypair (`solana config get`).
    - Anchor reads provider settings from `Anchor.toml`. Update `provider.wallet` if your keypair lives elsewhere.

4.  **Build Anchor Programs**

    ```bash
    anchor build
    ```

    This compiles all four programs and generates updated IDLs and type definitions under `target/`.

## Development

### Yarn workspace scripts (root `package.json`)

| Script             | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `yarn app:dev`     | Runs the Phaser client dev server (`yarn workspace app dev`).                   |
| `yarn app:build`   | Type-checks and builds the Phaser client (`yarn workspace app build`).          |
| `yarn app:preview` | Serves the last production build locally for QA (`yarn workspace app preview`). |
| `yarn app:test`    | Executes client unit tests via Vitest (`yarn workspace app test`).              |
| `yarn lint`        | Runs Prettier in check mode across the monorepo.                                |
| `yarn lint:fix`    | Formats the repo using Prettier.                                                |

### Client workspace scripts (`app/package.json`)

| Script         | Description                              |
| -------------- | ---------------------------------------- |
| `yarn dev`     | Vite dev server for Phaser.              |
| `yarn build`   | Type-check (`tsc`) then build with Vite. |
| `yarn preview` | Preview the production build.            |
| `yarn test`    | Run client tests with Vitest.            |

### Running the Game Locally

```bash
yarn app:dev
# open http://localhost:5173/
```

The client expects on-chain program data. You can:

- Connect to a devnet/localnet where the programs are deployed (addresses in `Anchor.toml`).
- Use `anchor run init-dungeon-config` to seed initial dungeon config data.
- Run a local validator using `anchor localnet`.

## Anchor Workflow

This project relies on standard Anchor tooling plus a custom initializer script:

### `anchor build`

Compiles all programs under `programs/` and generates updated IDLs/types under `target/`. Run this whenever Rust program code changes.

```bash
anchor build
```

### `anchor deploy`

Deploys the compiled artifacts to the cluster defined in `Anchor.toml` (`[provider]` section).

```bash
anchor deploy
```

### `anchor test`

Runs the integration test suite using `ts-mocha`. This is the best way to validate end-to-end functionality.

```bash
anchor test
```

### `anchor run init-dungeon-config`

Executes the custom script declared in `Anchor.toml` under `[scripts]`. `scripts/init-dungeon-config.js` seeds the `dungeon-nft` config account with initial parameters.

```bash
anchor run init-dungeon-config
```

## Deployment

1.  **Build programs**
    ```bash
    anchor build
    ```
2.  **Deploy programs to target cluster**
    ```bash
    anchor deploy
    ```
3.  **Bootstrap dungeon config**
    ```bash
    anchor run init-dungeon-config
    ```
4.  **Build the client**
    ```bash
    yarn app:build
    ```
5.  **Serve static assets**
    The build outputs to `app/dist`. Host the content using any static web server. Ensure client environment variables (e.g., `VITE_SOLANA_RPC_URL`) target the cluster where the programs are deployed.

## License

No explicit license is bundled with this repository. All rights are reserved by the authors. Contact the maintainers for usage or distribution questions.
