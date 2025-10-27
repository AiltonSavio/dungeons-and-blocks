# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Building and Development

```bash
# Build Anchor programs (compiles Rust programs and generates IDLs/types)
anchor build

# Run Phaser client dev server
yarn app:dev

# Build Phaser client for production
yarn app:build

# Preview production build
yarn app:preview

# Run client unit tests (Vitest)
yarn app:test

# Format code
yarn lint:fix

# Check formatting
yarn lint
```

### Rust Program Development

```bash
# Format Rust code in programs
cd programs/hero-core && cargo fmt
cd programs/dungeon-nft && cargo fmt
cd programs/adventure-engine && cargo fmt

# Run Rust linting
cd programs/hero-core && cargo clippy
```

## Architecture Overview

### Four-Program System

This project consists of four interconnected Anchor programs that work together to create an on-chain dungeon crawler:

**1. `dungeon-nft` (3qfE22hKoyPcDvtuYEAkCj9kuFHJVdXRkN6Qpp4UZhuw)**
- Mints dungeon NFTs with deterministic procedurally-generated layouts
- Uses VRF (Verifiable Random Function) for randomness via callback pattern
- Stores dungeon grid dimensions, seed, and metadata on-chain in `DungeonMint` accounts
- Managed by `DungeonConfig` account initialized via `init-dungeon-config.js`
- Key instructions: `initialize_config`, `mint_dungeon`, `callback_mint_dungeon`, `mint_dungeon_with_seed`

**2. `hero-core` (B4aW9eJbVnTrTTR9SYqVRodYt13TAQEmkhJ2JNMaVM7v)**
- Manages hero NFT lifecycle: minting, leveling, status effects, traits, stress, and burning
- Supports both free and paid minting with VRF randomness for stat generation
- Provides adventure locking mechanisms to prevent heroes from being used in multiple adventures simultaneously
- **Town services**: Abbey (stress reduction), Tavern (stress management), Sanitarium (trait treatment), Blacksmith (VRF-based stat rerolling)
- Key account types: `PlayerAccount`, `HeroMint` (stores hero stats, XP, HP, status effects, stress, traits)
- Key instructions: `mint_hero_free`, `mint_hero_paid`, `mint_hero_with_seed`, `level_up_hero`, `callback_level_up_hero`, `lock_for_adventure`, `unlock_from_adventure`, `update_hp_from_adventure`, `abbey_service`, `tavern_service`, `sanitarium_treatment`, `blacksmith_service`, `callback_reroll_stats`

**3. `player-economy` (7wWA6dk96DR9g3NVSw5iQkHFCidK7DdV3V71Auv9bZMj)**
- Manages player gold and persistent item inventory across all adventures
- Provides buy/sell shop mechanics with defined item prices and stack limits
- Tracks hourly gold grants with cooldown system (200 gold every 60 minutes)
- Supports item consumption for adventure preparation
- Key account types: `PlayerEconomy` (stores gold, items array, last grant timestamp)
- Item definitions: `PouchGold`, `StressTonic`, `MinorTorch`, `HealingSalve`, `MysteryRelic`, `CalmingIncense`, `PhoenixFeather`
- Key instructions: `initialize_player_economy`, `buy_item`, `sell_item`, `spend_gold`, `grant_hourly_gold`, `consume_items`

**4. `adventure-engine` (9qbdCw4BAiyecsGd1oJ1EfnCgYbBMxuYeWr7tpZ3BqAt)**
- Ephemeral rollup-based program using MagicBlock's Bolt SDK
- Manages active dungeon runs: movement, combat, loot, portal traversal, and ephemeral item inventory
- Creates `AdventureSession` accounts that track hero positions, opened chests, used portals, dungeon state, and items collected during the run
- Uses delegation pattern for ephemeral execution (see `#[delegate]`, `#[commit]`, `#[ephemeral]` macros)
- Item management: Items found during adventures are stored in `ItemSlot` array (max 20 slots) and can be picked up, dropped, or swapped
- Key instructions: `start_adventure`, `delegate_adventure`, `move_hero`, `exit_adventure`, `pickup_item`, `drop_item`, `swap_item`

### Program Interaction Flow

**Town Phase:**
1. Player initializes economy account via `player-economy::initialize_player_economy` → creates `PlayerEconomy` PDA
2. Player claims hourly gold via `grant_hourly_gold` (200 gold every 60 minutes)
3. Player buys/sells items via `buy_item`/`sell_item` → modifies `PlayerEconomy.gold` and `items` array
4. Player uses town services on heroes:
   - `hero-core::abbey_service` - reduce stress
   - `hero-core::tavern_service` - manage stress and morale
   - `hero-core::sanitarium_treatment` - treat negative traits
   - `hero-core::blacksmith_service` + `callback_reroll_stats` - VRF-based stat rerolling

**Adventure Phase:**
1. Player mints dungeon via `dungeon-nft::mint_dungeon` → creates `DungeonMint` with seed
2. Player mints heroes via `hero-core::mint_hero_free` or `mint_hero_paid` → creates `HeroMint` accounts
3. Player starts adventure via `adventure-engine::start_adventure` → creates `AdventureSession`, locks heroes via CPI to `hero-core`
4. Adventure is delegated to ephemeral validator via `delegate_adventure` for fast, gasless moves
5. Player issues movement commands via `move_hero` on ephemeral rollup
6. Player manages ephemeral inventory via `pickup_item`, `drop_item`, `swap_item` during dungeon exploration
7. Player commits changes back via `exit_adventure` → unlocks heroes, updates HP/XP via CPI to `hero-core`

### Client Architecture

The Phaser 3 client (`app/`) consumes on-chain data and renders the game:

**State Management (`app/src/state/`)**
- `dungeonChain.ts` - Fetches `DungeonMint` accounts and provides helper functions for minting
- `heroChain.ts` - Fetches `HeroMint` accounts and provides hero lifecycle functions (including town services)
- `adventureChain.ts` - Interacts with `AdventureSession` accounts and ephemeral delegation
- `economyChain.ts` - Interacts with `PlayerEconomy` accounts for gold, items, and shop transactions
- `runState.ts` - Local game state for current dungeon run
- `townStore.ts` - Town scene state (hero selection, economy, shop interface)

**Deterministic Dungeon Generation (`app/src/dungeon/`)**
- Client reads `DungeonMint.seed`, `grid`, `rooms`, `edges` from on-chain account
- Derives doors, chests, and portals deterministically from room/edge data (see `deriveDoorTilesFromRooms`, `generateChestTiles`)
- **Critical**: Client-side generation must match on-chain logic exactly. Never introduce divergent RNG.

**Scene Structure (`app/src/scenes/`)**
- `Game.ts` - Main dungeon exploration scene
- `TownScene.ts` - Hero selection and dungeon launching
- `EmbarkScene.ts` - Pre-adventure setup
- `Combat.ts` - Combat encounter handling

## Critical Development Guidelines

### On-Chain Data Consistency
- Dungeon layouts MUST be derived from `DungeonMint` accounts. The client reads `grid`, `rooms`, and `edges` from chain.
- Never create client-side dungeon generators that diverge from the on-chain layout.
- Use the `seed` field for deterministic RNG (see `mulberry32` in `app/src/dungeon/generate.ts`).

### Program Development Patterns
- Each program uses modular structure: `lib.rs` declares instructions, `instructions/` contains handlers, `state.rs` defines accounts, `logic.rs` contains game logic
- VRF callback pattern: `mint_dungeon` requests randomness, `callback_mint_dungeon` consumes it
- Hero locking: Adventure programs must call `hero_core::lock_for_adventure` before using heroes, `unlock_from_adventure` when done
- Adventure delegation: Use MagicBlock's delegation macros (`#[delegate]`, `#[commit]`, `#[ephemeral]`) for gasless gameplay

### IDL and Type Generation
- After `anchor build`, IDLs are written to `target/idl/` and TypeScript types to `target/types/`
- Client code imports these types directly (e.g., `import type { DungeonNft } from "../../../target/types/dungeon_nft"`)
- Regenerate client types after ANY Rust program changes by running `anchor build`

### Test Fixtures and Local Validator
- `Anchor.toml` configures test validator with MagicBlock's World program (`WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n`)
- Test ledger stored in `.bolt/test-ledger`
- Registry account loaded from `tests/fixtures/registry.json`
- Validator RPC URL: `https://rpc.magicblock.app/devnet/`

### Deployment Notes
- Program IDs are declared in `Anchor.toml` under `[programs.devnet]` and `[programs.localnet]`
- These IDs are hardcoded in `declare_id!` macros in each program's `lib.rs`
- Update `Anchor.toml` provider settings before deployment (cluster, wallet path)
- After deploying to new cluster, update program IDs in both `Anchor.toml` and `lib.rs`, then rebuild to regenerate IDLs

## Code Organization Standards

### Anchor Programs
- Keep instruction handlers in `instructions/` module (e.g., `mint.rs`, `config.rs`, `adventure.rs`, `items.rs`, `economy.rs`)
- Shared account structs in `state.rs`
- Shared game logic/helpers in `logic.rs` and `helpers.rs`
- Error enums in `errors.rs`
- Constants (seeds, sizes, limits) in `constants.rs`
  - `adventure-engine` constants: `MAX_PARTY=4`, `MAX_ITEMS=6`, `MAX_ROOMS=40`, `MAX_DOORS=64`, `MAX_CHESTS=64`, `MAX_PORTALS=8`, `RESET_INTERVAL_SECONDS=86400`
  - `player-economy` constants: `ITEM_COUNT=7`, `HOURLY_GRANT_AMOUNT=200`, `HOURLY_GRANT_COOLDOWN=3600`

### Client Code
- Scene files go in `app/src/scenes/`
- State management utilities in `app/src/state/`
- Dungeon generation/hydration in `app/src/dungeon/`
- UI components in `app/src/ui/`
- Shared types in `app/src/state/types.ts` or `models.ts`

### Commit Style
- Use concise, imperative subjects (e.g., `add hero inventory sync`, `fix dungeon portal rendering`)
- Group related changes in single commits
- Existing history uses single-line summaries with optional context after colon
