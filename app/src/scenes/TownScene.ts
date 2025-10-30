import Phaser from "phaser";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { townStore } from "../state/townStore";
import { ItemDefinition, MARKET_ITEMS, MAX_HEROES } from "../state/models";
import type { ItemId } from "../state/items";
import {
  SAFE_MARGIN,
  UI_FONT,
  PANEL_COLORS,
  BUTTON_DIMENSIONS,
  snap,
} from "../ui/uiConfig";
import {
  ChainHero,
  PlayerProfile,
  HERO_FREE_MINT_LIMIT,
  HERO_PAID_COST,
  fetchHeroes,
  fetchPlayerProfile,
  getHeroTypeLabel,
  getQuirkLabel,
  createInitializePlayerInstruction,
  createMintHeroInstruction,
  canLevelUpHero,
  createLevelUpHeroInstruction,
  getNextLevelRequirement,
  createRerollStatsInstruction,
  createRelieveStressInstruction,
  createApplyBlessingInstruction,
  HERO_BLACKSMITH_COST,
  HERO_BLACKSMITH_MAX_REROLLS,
  HERO_ABBEY_COST,
  createHealHeroInstruction,
  HERO_TAVERN_HEAL_COST_PER_HP,
  createBurnHeroInstruction,
  createCureStatusEffectInstruction,
  createCureNegativeTraitInstruction,
  HERO_SANITARIUM_STATUS_CURE_COST,
  HERO_SANITARIUM_TRAIT_CURE_COST,
} from "../state/heroChain";
import {
  fetchHeroLockStatuses,
  type HeroLockStatus,
} from "../state/adventureChain";

import {
  BuildingKey,
  GOLD_PANEL_WIDTH,
  WALLET_PANEL_HEIGHT,
  WALLET_PANEL_WIDTH,
  AIRDROP_BUTTON_WIDTH,
} from "./town/constants";
import { createButton } from "./town/ui/createButton";
import {
  createTopBar,
  renderBackground,
  renderBuildings,
  renderEmbarkCTA,
} from "./town/ui/layout";
import { TooltipManager } from "./town/ui/TooltipManager";
import { RosterPanel, RosterPanelState } from "./town/RosterPanel";
import { formatHeroTimestamp } from "./town/heroFormatting";
import {
  createGrantHourlyGoldInstruction,
  createBuyItemInstruction,
  createSellItemInstruction,
  createInitializeEconomyInstruction,
  fetchPlayerEconomy,
  HOURLY_GRANT_AMOUNT,
  HOURLY_GRANT_COOLDOWN_SECONDS,
} from "../state/economyChain";

type ToastEntry = {
  container: Phaser.GameObjects.Container;
  ttl: number;
};

type WalletPublicKey = {
  toBase58(): string;
  toString(): string;
};

type SolanaEventHandler = (...args: unknown[]) => void;

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: WalletPublicKey | null;
  connect(options?: {
    onlyIfTrusted?: boolean;
  }): Promise<{ publicKey: WalletPublicKey } | void>;
  disconnect(): Promise<void>;
  on?(event: string, handler: SolanaEventHandler): void;
  off?(event: string, handler: SolanaEventHandler): void;
  removeListener?(event: string, handler: SolanaEventHandler): void;
  request?(args: { method: string; params?: unknown[] }): Promise<unknown>;
  signAndSendTransaction?: (
    tx: Transaction
  ) => Promise<{ signature: string } | string>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
};

const PLAYER_ECONOMY_COOLDOWN_ERROR = 6010;

export class TownScene extends Phaser.Scene {
  private safe = SAFE_MARGIN;
  private store = townStore;

  private worldLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private tooltipLayer!: Phaser.GameObjects.Container;
  private toastLayer!: Phaser.GameObjects.Container;

  private rosterPanel!: RosterPanel;
  private expandedHeroId?: number;

  private goldPanel!: Phaser.GameObjects.Container;

  private walletPanel!: Phaser.GameObjects.Container;
  private walletStatusText?: Phaser.GameObjects.Text;
  private walletProvider?: SolanaProvider;
  private walletAddress?: string;
  private walletBusy = false;
  private walletConnectHandler?: (publicKey: WalletPublicKey) => void;
  private walletDisconnectHandler?: () => void;
  private grantPanel!: Phaser.GameObjects.Container;
  private grantStatusText?: Phaser.GameObjects.Text;
  private grantBusy = false;
  private nextGrantAvailableAt = 0;
  private grantCooldownTimer?: Phaser.Time.TimerEvent;
  private solanaConnection?: Connection;
  private heroes: ChainHero[] = [];
  private heroesLoading = false;
  private heroLoadError?: string;
  private heroLockStatuses: Map<string, HeroLockStatus> = new Map();
  private playerProfile: PlayerProfile | null | undefined;
  private programBusy = false;

  private plazaCenterX = 0;
  private plazaCenterY = 0;

  private modalOverlay?: Phaser.GameObjects.Rectangle;
  private modalPanel?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;

  private tooltipManager!: TooltipManager;
  private toasts: ToastEntry[] = [];

  private unsubChange?: () => void;
  private unsubToast?: () => void;

  private modalWheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;

  private keyboardBindings: { event: string; handler: () => void }[] = [];

  constructor() {
    super("TownScene");
  }

  init() {
    // Initialization logic
  }

  create() {
    this.worldLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0).setDepth(10);
    this.tooltipLayer = this.add.container(0, 0).setDepth(50);
    this.toastLayer = this.add
      .container(this.scale.width / 2, this.safe)
      .setDepth(60);

    this.releaseKeyboardBindings();

    const background = renderBackground(this, this.safe, this.worldLayer);
    this.plazaCenterX = background.centerX;
    this.plazaCenterY = background.centerY;

    this.tooltipManager = new TooltipManager(
      this,
      this.tooltipLayer,
      this.safe
    );
    renderBuildings({
      scene: this,
      safeMargin: this.safe,
      worldLayer: this.worldLayer,
      tooltip: this.tooltipManager,
      onSelect: (key) => this.openBuilding(key),
      bindHotkey: (event, handler) => this.bindKey(event, handler),
    });

    const topBar = createTopBar({
      scene: this,
      safeMargin: this.safe,
      uiLayer: this.uiLayer,
    });
    this.walletPanel = topBar.walletPanel;
    this.grantPanel = topBar.grantPanel;
    this.goldPanel = topBar.goldPanel;

    this.rosterPanel = new RosterPanel({
      scene: this,
      safeMargin: this.safe,
      uiLayer: this.uiLayer,
      maxHeroes: MAX_HEROES,
      onHeroToggle: (heroId) => {
        this.expandedHeroId = heroId;
        this.updateRosterPanel();
      },
    });
    this.rosterPanel.init();

    this.initWalletIntegration();
    this.updateGrantButton();

    renderEmbarkCTA({
      scene: this,
      centerX: this.plazaCenterX,
      centerY: this.plazaCenterY,
      uiLayer: this.uiLayer,
      createButton: (x, y, width, label, handler, enabled) =>
        createButton(this, x, y, width, label, handler, enabled),
      onEmbark: () => this.launchEmbark(),
    });

    this.bindInputs();

    this.unsubChange = this.store.subscribe(() => {
      this.refreshUI();
    });
    this.unsubToast = this.store.onToast((message) => this.showToast(message));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubChange?.();
      this.unsubToast?.();
      this.input.off(
        "pointermove",
        this.rosterPanel.handlePointerMove,
        this.rosterPanel
      );
      this.input.off(
        "pointerup",
        this.rosterPanel.handlePointerUp,
        this.rosterPanel
      );
      this.input.off(
        "pointerupoutside",
        this.rosterPanel.handlePointerUp,
        this.rosterPanel
      );
      this.releaseKeyboardBindings();
      this.teardownWalletIntegration();
      this.rosterPanel.destroy();
      if (this.grantCooldownTimer) {
        this.grantCooldownTimer.remove(false);
        this.grantCooldownTimer = undefined;
      }
    });

    this.input.on(
      "pointermove",
      this.rosterPanel.handlePointerMove,
      this.rosterPanel
    );
    this.input.on(
      "pointerup",
      this.rosterPanel.handlePointerUp,
      this.rosterPanel
    );
    this.input.on(
      "pointerupoutside",
      this.rosterPanel.handlePointerUp,
      this.rosterPanel
    );

    this.refreshUI();
  }

  update(_time: number, delta: number) {
    if (!this.toasts.length) return;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i];
      toast.ttl -= delta;
      if (toast.ttl <= 0) {
        toast.container.destroy();
        this.toasts.splice(i, 1);
        continue;
      }
      const alpha = toast.ttl < 400 ? toast.ttl / 400 : 1;
      toast.container.setAlpha(alpha);
      toast.container.y = this.safe + 16 + (this.toasts.length - i - 1) * 44;
    }
  }

  private refreshUI() {
    this.renderGold();
    this.updateGrantButton();
    this.updateRosterPanel();
  }

  private updateRosterPanel() {
    const rosterState: RosterPanelState = {
      walletAddress: this.walletAddress,
      heroes: this.heroes,
      heroesLoading: this.heroesLoading,
      heroLoadError: this.heroLoadError,
      heroLockStatuses: this.heroLockStatuses,
      expandedHeroId: this.expandedHeroId,
    };
    this.rosterPanel?.update(rosterState);
    this.broadcastHeroRoster();
  }

  private broadcastHeroRoster() {
    this.registry.set("town:heroRoster", {
      heroes: [...this.heroes],
      heroesLoading: this.heroesLoading,
      heroLoadError: this.heroLoadError,
      heroLockStatuses: this.heroLockStatuses,
      walletAddress: this.walletAddress,
    });
  }

  private renderGold() {
    this.goldPanel.removeAll(true);
    const gold = this.store.getInventory().gold;
    const plate = this.add
      .rectangle(0, 0, GOLD_PANEL_WIDTH, 24, 0x252b3a)
      .setOrigin(1, 0);
    plate.setStrokeStyle(1, 0x40485c, 1);
    plate.setInteractive({ cursor: "default" });
    this.goldPanel.add(plate);

    const leftPadding = 16;
    const rightPadding = 12;

    this.goldPanel.add(
      this.add
        .text(-GOLD_PANEL_WIDTH + leftPadding, 4, "Gold", {
          ...UI_FONT.body,
          color: "#c1c6db",
        })
        .setOrigin(0, 0)
    );

    this.goldPanel.add(
      this.add
        .text(-rightPadding, 4, gold.toLocaleString(), {
          ...UI_FONT.heading,
          fontSize: "18px",
          color: "#ffe28a",
        })
        .setOrigin(1, 0)
    );
  }

  private initWalletIntegration() {
    const provider = this.getWalletProvider();
    if (!provider) {
      this.updateWalletControl();
      return;
    }

    this.walletProvider = provider;

    this.walletConnectHandler = (publicKey) => {
      const address = this.resolveWalletAddress(
        publicKey ?? provider.publicKey ?? undefined
      );
      if (!address) return;
      this.walletAddress = address;
      this.walletBusy = false;
      this.playerProfile = undefined;
      this.updateWalletControl();
      this.loadHeroes(address);
      this.syncEconomyFromChain();
    };

    this.walletDisconnectHandler = () => {
      this.walletAddress = undefined;
      this.walletBusy = false;
      this.heroes = [];
      this.heroesLoading = false;
      this.heroLoadError = undefined;
      this.heroLockStatuses.clear();
      this.expandedHeroId = undefined;
      this.playerProfile = undefined;
      this.updateWalletControl();
      this.updateRosterPanel();
    };

    provider.on?.("connect", (...args) =>
      this.walletConnectHandler?.(args[0] as WalletPublicKey)
    );
    provider.on?.("disconnect", () => this.walletDisconnectHandler?.());

    if (provider.publicKey) {
      const address = this.resolveWalletAddress(provider.publicKey);
      if (address) {
        this.walletAddress = address;
        this.playerProfile = undefined;
        this.loadHeroes(address);
        this.syncEconomyFromChain();
      }
    }
    this.updateWalletControl();
  }

  private teardownWalletIntegration() {
    if (!this.walletProvider) return;
    if (this.walletConnectHandler) {
      this.walletProvider.off?.("connect", (...args) =>
        this.walletConnectHandler?.(args[0] as WalletPublicKey)
      );
      this.walletProvider.removeListener?.("connect", (...args) =>
        this.walletConnectHandler?.(args[0] as WalletPublicKey)
      );
    }
    if (this.walletDisconnectHandler) {
      this.walletProvider.off?.("disconnect", this.walletDisconnectHandler);
      this.walletProvider.removeListener?.(
        "disconnect",
        this.walletDisconnectHandler
      );
    }
    this.walletConnectHandler = undefined;
    this.walletDisconnectHandler = undefined;
  }

  private async connectWallet() {
    const provider = this.getWalletProvider();
    if (!provider) {
      this.showToast("No Solana wallet detected.");
      return;
    }
    if (this.walletBusy) return;

    this.walletBusy = true;
    this.updateWalletControl();

    try {
      const result = await provider.connect();
      const address = this.resolveWalletAddress(
        (result as { publicKey?: WalletPublicKey })?.publicKey ??
          provider.publicKey ??
          undefined
      );
      if (address) {
        this.walletAddress = address;
        this.showToast(`Connected ${this.shortenAddress(address)}`);
        this.loadHeroes(address);
        this.syncEconomyFromChain();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
      if (!message || /user rejected/i.test(message)) {
        // user closed the modal; no toast to avoid noise
      } else if (/wallet not/i.test(message)) {
        this.showToast("Wallet not found. Install a Solana wallet.");
      } else {
        this.showToast("Failed to connect wallet.");
      }
    } finally {
      this.walletBusy = false;
      this.updateWalletControl();
    }
  }

  private async disconnectWallet() {
    const provider = this.walletProvider ?? this.getWalletProvider();
    if (!provider || this.walletBusy) return;

    this.walletBusy = true;
    this.updateWalletControl();

    try {
      await provider.disconnect();
      this.walletAddress = undefined;
      this.showToast("Wallet disconnected. Connect again to keep exploring.");
    } catch {
      this.showToast("Failed to disconnect wallet.");
    } finally {
      this.walletBusy = false;
      this.heroes = [];
      this.heroesLoading = false;
      this.heroLoadError = undefined;
      this.heroLockStatuses.clear();
      this.expandedHeroId = undefined;
      this.updateWalletControl();
      this.updateRosterPanel();
    }
  }

  private async loadHeroes(ownerAddress: string) {
    if (!ownerAddress) return;
    const requestOwner = ownerAddress;
    this.heroesLoading = true;
    this.heroLoadError = undefined;
    this.playerProfile = undefined;

    this.updateRosterPanel();

    try {
      const connection = this.getSolanaConnection();
      if (!connection) {
        throw new Error("RPC unavailable.");
      }
      const ownerPk = new PublicKey(ownerAddress);

      const [heroes, profile] = await Promise.all([
        fetchHeroes(connection, ownerPk),
        fetchPlayerProfile(connection, ownerPk),
      ]);
      if (this.walletAddress !== requestOwner) return;
      // Pending requests should be filtered out, but some older mints may not
      // populate the flag. Treat undefined as settled so legacy heroes appear.
      // Also filter out burned heroes.
      const filteredHeroes = heroes.filter(
        (hero) => (hero.pendingRequest ?? 0) === 0 && !hero.isBurned
      );

      // Fetch hero lock statuses
      const heroMints = filteredHeroes.map(
        (hero) => new PublicKey(hero.account)
      );
      this.heroLockStatuses = await fetchHeroLockStatuses(
        connection,
        heroMints
      );

      // Sort heroes: inactive (is_active: false) first, then active (is_active: true)
      this.heroes = filteredHeroes.sort((a, b) => {
        const aStatus = this.heroLockStatuses.get(a.account);
        const bStatus = this.heroLockStatuses.get(b.account);
        const aActive = aStatus?.isActive ?? false;
        const bActive = bStatus?.isActive ?? false;

        // Sort: false < true (inactive heroes first)
        if (aActive === bActive) {
          return a.id - b.id; // Secondary sort by ID
        }
        return aActive ? 1 : -1;
      });

      this.playerProfile = profile;
    } catch (error) {
      if (this.walletAddress !== requestOwner) return;
      const message =
        error instanceof Error ? error.message : "Failed to load heroes.";
      this.heroLoadError = message;
      this.heroes = [];
      this.heroLockStatuses.clear();
      this.playerProfile = null;
    } finally {
      if (this.walletAddress !== requestOwner) return;
      this.heroesLoading = false;
      this.updateRosterPanel();
    }
  }

  private openWalletModal() {
    const address = this.walletAddress;
    if (!address) {
      this.connectWallet();
      return;
    }

    let balanceText: Phaser.GameObjects.Text | undefined;

    this.openModal("Adventurer Wallet", (panel, close) => {
      let offset = 0;
      const sectionLabel = this.add
        .text(0, offset, "Connected Address", {
          ...UI_FONT.caption,
          color: "#7e859b",
        })
        .setOrigin(0, 0);
      panel.add(sectionLabel);
      offset += sectionLabel.height + 6;

      const addressText = this.add
        .text(0, offset, address, {
          ...UI_FONT.body,
          color: "#f4f6ff",
          wordWrap: { width: 420 },
        })
        .setOrigin(0, 0);
      panel.add(addressText);
      offset += addressText.height + 16;

      balanceText = this.add
        .text(0, offset, "Balance: Fetching...", {
          ...UI_FONT.body,
          color: "#c1c6db",
        })
        .setOrigin(0, 0);
      panel.add(balanceText);
      offset += balanceText.height + 24;

      const disconnectBtn = createButton(
        this,
        0,
        offset,
        200,
        "Disconnect Wallet",
        () => {
          this.disconnectWallet().finally(() => close());
        }
      );
      panel.add(disconnectBtn);

      const copyBtn = createButton(
        this,
        210,
        offset,
        150,
        "Copy Address",
        () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(address).then(
              () => {
                this.showToast("Address copied to clipboard!");
              },
              () => {
                this.showToast("Failed to copy address.");
              }
            );
          } else {
            this.showToast("Clipboard API not available.");
          }
        }
      );
      panel.add(copyBtn);
    });

    if (balanceText) {
      this.fetchWalletBalance(address, balanceText);
    }
  }

  private async fetchWalletBalance(
    address: string,
    label: Phaser.GameObjects.Text
  ) {
    const connection = this.getSolanaConnection();
    if (!connection) {
      if (label.scene) {
        label.setText("Balance: RPC unavailable.");
      }
      return;
    }

    try {
      const key = new PublicKey(address);
      const lamports = await connection.getBalance(key);
      if (!label.scene || this.walletAddress !== address) return;
      const sol = lamports / LAMPORTS_PER_SOL;
      label.setText(`Balance: ${sol.toFixed(4)} SOL`);
    } catch {
      if (!label.scene) return;
      label.setText("Balance: Unable to fetch.");
    }
  }

  private getSolanaConnection(): Connection | undefined {
    if (typeof window === "undefined") return undefined;
    if (!this.solanaConnection) {
      const env =
        (
          import.meta as unknown as {
            env?: Record<string, string | undefined>;
          }
        ).env ?? {};
      const endpoint =
        env.VITE_SOLANA_RPC_URL ??
        (window as unknown as { __DNB_SOLANA_RPC__?: string })
          .__DNB_SOLANA_RPC__ ??
        clusterApiUrl("devnet");
      this.solanaConnection = new Connection(endpoint, "confirmed");
    }
    return this.solanaConnection;
  }

  private async initializePlayerProfile() {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) return;
    const provider = this.getWalletProvider();
    const connection = this.getSolanaConnection();
    if (!provider) {
      this.showToast("Wallet provider unavailable.");
      return;
    }
    if (!connection) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);
    try {
      const existing = await fetchPlayerProfile(connection, owner);
      if (existing) {
        this.playerProfile = existing;
        this.showToast("Adventurer ledger already initialized.");
        await this.loadHeroes(this.walletAddress);
        return;
      }
    } catch (err) {
      console.warn("Failed to probe player profile before init:", err);
    }

    const ix = createInitializePlayerInstruction(owner);

    this.programBusy = true;
    try {
      await this.sendProgramTransaction([ix]);
      this.showToast("Adventurer ledger initialized.");
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openTavern();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to initialize ledger.");
    } finally {
      this.programBusy = false;
    }
  }

  private async mintHero() {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy || this.heroesLoading) return;

    if (this.playerProfile === null) {
      await this.initializePlayerProfile();
      return;
    }

    if (!this.playerProfile) {
      this.showToast("Player profile not yet loaded.");
      return;
    }

    const profile = this.playerProfile;
    if (profile.heroCount >= MAX_HEROES) {
      this.showToast("Hero roster is at capacity.");
      return;
    }

    const freeRemaining = Math.max(
      0,
      HERO_FREE_MINT_LIMIT - profile.freeMintCount
    );
    const mintType = freeRemaining > 0 ? "free" : "paid";

    const owner = new PublicKey(this.walletAddress);
    const { instruction } = createMintHeroInstruction({
      owner,
      profile,
      mintType,
    });

    this.programBusy = true;
    try {
      await this.sendProgramTransaction([instruction]);
      const toastMessage =
        mintType === "free"
          ? "Summon request submitted. Awaiting VRF callback."
          : "Paid summon submitted. Awaiting VRF callback.";
      this.showToast(toastMessage);
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openTavern();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to mint hero.");
    } finally {
      this.programBusy = false;
    }
  }

  private async levelUpHero(hero: ChainHero) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy || this.heroesLoading) {
      this.showToast("Another action is still processing.");
      return;
    }
    if (hero.pendingRequest !== 0) {
      this.showToast("That hero is already waiting on a VRF callback.");
      return;
    }
    const next = getNextLevelRequirement(hero);
    if (!next) {
      this.showToast("Hero already reached the maximum level.");
      return;
    }
    if (!canLevelUpHero(hero)) {
      this.showToast(
        `Requires XP greater than ${next.requiredExperience} to reach level ${next.targetLevel}.`
      );
      return;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);
    const instruction = createLevelUpHeroInstruction({
      owner,
      heroId: hero.id,
    });

    this.programBusy = true;
    try {
      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Level-up submitted for Hero #${hero.id}. Awaiting VRF callback.`
      );
      await this.loadHeroes(this.walletAddress);
    } catch (err) {
      this.handleProgramError(err, "Failed to level up hero.");
    } finally {
      this.programBusy = false;
    }
  }

  private async sendProgramTransaction(
    instructions: TransactionInstruction[]
  ): Promise<string> {
    const provider = this.getWalletProvider();
    if (!provider) {
      throw new Error("Wallet provider unavailable.");
    }
    if (!this.walletAddress) {
      throw new Error("Wallet not connected.");
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      throw new Error("RPC unavailable.");
    }

    const owner = new PublicKey(this.walletAddress);
    const latestBlockhash = await connection.getLatestBlockhash();

    const tx = new Transaction().add(...instructions);
    tx.feePayer = owner;
    tx.recentBlockhash = latestBlockhash.blockhash;

    // Simulate first
    console.log("Attempting transaction simulation...");
    try {
      const simulation = await connection.simulateTransaction(tx);
      if (simulation.value.err) {
        console.error("Simulation error:", simulation.value.err);
        console.error("Simulation logs:", simulation.value.logs);
        throw new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
      } else {
        console.log("Simulation successful");
        console.log("Simulation logs:", simulation.value.logs);
      }
    } catch (simErr) {
      console.error("Simulation attempt failed:", simErr);
      throw new Error("Transaction simulation failed.");
    }

    // Sign and send
    let signature: string;
    let needsConfirmation = false;

    try {
      if (provider.signAndSendTransaction) {
        // Provider handles sending AND confirming
        const result = await provider.signAndSendTransaction(tx);
        signature =
          typeof result === "string" ? result : result.signature ?? "";
        needsConfirmation = false; // Provider already confirmed
      } else if (provider.signTransaction) {
        // We need to send and confirm manually
        const signed = await provider.signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        needsConfirmation = true;
      } else {
        throw new Error("Wallet does not support transaction signing.");
      }

      if (!signature) {
        throw new Error("Transaction signature missing.");
      }
    } catch (err) {
      console.error("Transaction signing/sending failed:", err);
      throw err;
    }

    // Only confirm if we sent it ourselves
    if (needsConfirmation) {
      try {
        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );

        if (confirmation.value.err) {
          throw new Error(
            `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
          );
        }
      } catch (err) {
        console.error("Transaction confirmation failed:", err);
        throw err;
      }
    } else {
      console.log("Transaction confirmed by wallet provider");
    }

    return signature;
  }

  private handleProgramError(error: unknown, fallback: string) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : fallback;

    if (/user rejected/i.test(message)) {
      this.showToast("Transaction cancelled.");
    } else {
      console.error(error);
      this.showToast(fallback);
    }
  }

  private extractCustomErrorCode(error: unknown): number | null {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : null;
    if (!message) return null;

    const decimalMatch = message.match(/Custom\((\d+)\)/);
    if (decimalMatch) {
      return Number(decimalMatch[1]);
    }

    const hexMatch = message.match(/custom program error:\s*0x([0-9a-f]+)/i);
    if (hexMatch) {
      return parseInt(hexMatch[1], 16);
    }

    return null;
  }

  private updateWalletControl() {
    if (!this.walletPanel) return;

    this.walletPanel.removeAll(true);

    const provider = this.getWalletProvider();
    const hasProvider = Boolean(provider);
    const connected = Boolean(this.walletAddress);
    const baseColor = !hasProvider
      ? PANEL_COLORS.disabled
      : connected
      ? PANEL_COLORS.highlight
      : 0x252b3a;
    const hoverColor = !hasProvider
      ? PANEL_COLORS.disabled
      : PANEL_COLORS.hover;

    const plate = this.add
      .rectangle(0, 0, WALLET_PANEL_WIDTH, WALLET_PANEL_HEIGHT, baseColor)
      .setOrigin(0);
    plate.setStrokeStyle(1, 0x40485c, 1);
    this.walletPanel.add(plate);

    this.walletPanel.add(
      this.add
        .text(12, 6, "Wallet", {
          ...UI_FONT.caption,
          color: "#6a7188",
        })
        .setOrigin(0, 0)
    );

    const status = this.walletBusy
      ? "Connecting..."
      : connected
      ? `Manage ${this.shortenAddress(this.walletAddress!)}`
      : hasProvider
      ? "Connect Wallet"
      : "No wallet detected";
    const statusColor = connected ? "#8de9a3" : "#c1c6db";

    this.walletStatusText = this.add
      .text(12, 18, status, {
        ...UI_FONT.body,
        fontSize: "12px",
        color: this.walletBusy ? "#c1c6db" : statusColor,
      })
      .setOrigin(0, 0);
    this.walletPanel.add(this.walletStatusText);

    if (!hasProvider) {
      plate
        .setInteractive({ cursor: "not-allowed" })
        .on("pointerdown", () =>
          this.showToast("No Solana wallet detected. Install a wallet to play.")
        );
      return;
    }

    if (this.walletBusy) {
      plate.setInteractive({ cursor: "wait" });
      return;
    }

    plate
      .setInteractive({ cursor: "pointer" })
      .on("pointerover", () => plate.setFillStyle(hoverColor))
      .on("pointerout", () => plate.setFillStyle(baseColor))
      .on("pointerdown", () => {
        if (this.walletAddress) {
          this.openWalletModal();
        } else {
          this.connectWallet();
        }
      });

    this.updateGrantButton();
  }

  private updateGrantButton() {
    if (!this.grantPanel) return;

    this.grantPanel.removeAll(true);

    const provider = this.getWalletProvider();
    const hasProvider = Boolean(provider);
    const connected = Boolean(this.walletAddress);
    const now = Date.now();
    const onCooldown = this.nextGrantAvailableAt > now;
    const cooldownMinutes = onCooldown
      ? Math.max(1, Math.ceil((this.nextGrantAvailableAt - now) / 60000))
      : 0;
    const cooldownText =
      cooldownMinutes > 0 ? `Cooldown ~${cooldownMinutes}m` : "On cooldown";
    const ready =
      hasProvider &&
      connected &&
      !this.walletBusy &&
      !this.programBusy &&
      !this.grantBusy &&
      !onCooldown;

    const baseColor = !hasProvider
      ? PANEL_COLORS.disabled
      : ready
      ? PANEL_COLORS.highlight
      : PANEL_COLORS.disabled;
    const hoverColor = ready ? PANEL_COLORS.hover : baseColor;

    const plate = this.add
      .rectangle(0, 0, AIRDROP_BUTTON_WIDTH, WALLET_PANEL_HEIGHT, baseColor)
      .setOrigin(0);
    plate.setStrokeStyle(1, 0x40485c, 1);
    this.grantPanel.add(plate);

    this.grantPanel.add(
      this.add
        .text(12, 6, "Gold Airdrop", {
          ...UI_FONT.caption,
          color: "#6a7188",
        })
        .setOrigin(0, 0)
    );

    const status = !hasProvider
      ? "No wallet detected"
      : !connected
      ? "Connect your wallet"
      : this.walletBusy || this.programBusy
      ? "Wallet busy..."
      : this.grantBusy
      ? "Claiming..."
      : onCooldown
      ? cooldownText
      : "Claim 200 gold";
    const statusColor = ready ? "#ffe28a" : "#c1c6db";

    this.grantStatusText = this.add
      .text(12, 18, status, {
        ...UI_FONT.body,
        fontSize: "12px",
        color: statusColor,
      })
      .setOrigin(0, 0);
    this.grantPanel.add(this.grantStatusText);

    if (ready) {
      plate
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => plate.setFillStyle(hoverColor))
        .on("pointerout", () => plate.setFillStyle(baseColor))
        .on("pointerdown", () => this.requestHourlyGrant());
    } else {
      const cursor =
        this.walletBusy || this.programBusy || this.grantBusy
          ? "wait"
          : "not-allowed";
      plate.setInteractive({ cursor });
    }

    this.scheduleGrantReset();
  }

  private scheduleGrantReset() {
    if (this.grantCooldownTimer) {
      this.grantCooldownTimer.remove(false);
      this.grantCooldownTimer = undefined;
    }

    const remaining = this.nextGrantAvailableAt - Date.now();
    if (remaining > 0) {
      this.grantCooldownTimer = this.time.delayedCall(remaining, () => {
        this.grantCooldownTimer = undefined;
        this.nextGrantAvailableAt = 0;
        this.updateGrantButton();
      });
    }
  }

  private async requestHourlyGrant() {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.grantBusy || this.programBusy) return;

    const provider = this.getWalletProvider();
    const connection = this.getSolanaConnection();
    if (!provider) {
      this.showToast("Wallet provider unavailable.");
      return;
    }
    if (!connection) {
      this.showToast("RPC unavailable.");
      return;
    }

    this.programBusy = true;
    this.grantBusy = true;
    this.updateGrantButton();

    try {
      // Ensure economy account is initialized
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        this.showToast("Failed to initialize economy account.");
        return;
      }

      const owner = new PublicKey(this.walletAddress);
      const instruction = createGrantHourlyGoldInstruction(owner);

      await this.sendProgramTransaction([instruction]);
      this.showToast(`Vault credited with ${HOURLY_GRANT_AMOUNT} gold.`);

      // Sync from chain to update local state
      await this.syncEconomyFromChain();

      this.nextGrantAvailableAt =
        Date.now() + HOURLY_GRANT_COOLDOWN_SECONDS * 1000;
      this.updateGrantButton();
    } catch (err) {
      const code = this.extractCustomErrorCode(err);
      if (code === PLAYER_ECONOMY_COOLDOWN_ERROR) {
        this.showToast("Hourly grant still on cooldown.");
        const retryAt = Date.now() + 60 * 1000;
        if (this.nextGrantAvailableAt < retryAt) {
          this.nextGrantAvailableAt = retryAt;
        }
        this.updateGrantButton();
      } else {
        this.handleProgramError(err, "Failed to claim hourly grant.");
      }
    } finally {
      this.grantBusy = false;
      this.programBusy = false;
      this.updateGrantButton();
    }
  }

  private async ensureEconomyInitialized(): Promise<boolean> {
    if (!this.walletAddress) return false;

    const connection = this.getSolanaConnection();
    if (!connection) return false;

    try {
      const owner = new PublicKey(this.walletAddress);
      const economy = await fetchPlayerEconomy(connection, owner);

      if (economy) {
        return true; // Already initialized
      }

      // Need to initialize
      this.showToast("Initializing your economy account...");
      const instruction = createInitializeEconomyInstruction(owner);
      await this.sendProgramTransaction([instruction]);
      this.showToast("Economy account initialized!");
      return true;
    } catch (err) {
      console.error("Failed to ensure economy initialized:", err);
      this.showToast("Failed to initialize economy account.");
      return false;
    }
  }

  private async syncEconomyFromChain() {
    if (!this.walletAddress) return;

    const connection = this.getSolanaConnection();
    if (!connection) return;

    try {
      const owner = new PublicKey(this.walletAddress);
      const economy = await fetchPlayerEconomy(connection, owner);

      if (economy) {
        // Map on-chain items array to ItemId record
        const itemIds: ItemId[] = [
          "pouch_gold",
          "stress_tonic",
          "minor_torch",
          "healing_salve",
          "mystery_relic",
          "calming_incense",
          "phoenix_feather",
        ];

        const items: Record<ItemId, number> = {} as Record<ItemId, number>;
        for (let i = 0; i < economy.items.length; i++) {
          items[itemIds[i]] = economy.items[i];
        }

        // Sync using the public API
        this.store.syncInventoryFromChain(Number(economy.gold), items);
      }
    } catch (err) {
      console.error("Failed to sync economy from chain:", err);
    }
  }

  private async buyItemOnChain(itemId: ItemId) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      this.showToast("RPC unavailable.");
      return;
    }

    this.programBusy = true;

    try {
      // Ensure economy account is initialized
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        this.showToast("Failed to initialize economy account.");
        return;
      }

      const owner = new PublicKey(this.walletAddress);
      const instruction = createBuyItemInstruction(owner, itemId, 1);
      await this.sendProgramTransaction([instruction]);
      this.showToast(`Purchased 1x ${itemId.replace("_", " ")}.`);

      // Sync from chain to update local state
      await this.syncEconomyFromChain();
    } catch (err) {
      this.handleProgramError(err, "Failed to purchase item.");
    } finally {
      this.programBusy = false;
    }
  }

  private async sellItemOnChain(itemId: ItemId) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      this.showToast("RPC unavailable.");
      return;
    }

    this.programBusy = true;

    try {
      // Ensure economy account is initialized
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        this.showToast("Failed to initialize economy account.");
        return;
      }

      const owner = new PublicKey(this.walletAddress);
      const instruction = createSellItemInstruction(owner, itemId, 1);
      await this.sendProgramTransaction([instruction]);
      this.showToast(`Sold 1x ${itemId.replace("_", " ")}.`);

      // Sync from chain to update local state
      await this.syncEconomyFromChain();
    } catch (err) {
      this.handleProgramError(err, "Failed to sell item.");
    } finally {
      this.programBusy = false;
    }
  }

  private isHeroLocked(hero: ChainHero): boolean {
    const status = this.heroLockStatuses.get(hero.account);
    return (status?.isActive ?? false) || hero.locked;
  }

  private async rerollHeroStats(hero: ChainHero) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes cannot visit the blacksmith.");
      return;
    }
    if (hero.rerollCount >= HERO_BLACKSMITH_MAX_REROLLS) {
      this.showToast("Reroll limit reached for this hero.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createRerollStatsInstruction({
        owner,
        heroId: hero.id,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Blacksmith reroll queued for Hero #${hero.id} (cost ${HERO_BLACKSMITH_COST}g).`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openBlacksmith();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to reroll hero stats.");
    } finally {
      this.programBusy = false;
    }
  }

  private async healHero(hero: ChainHero, requestedAmount: number) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes must return from adventures first.");
      return;
    }

    const missing = Math.max(0, hero.maxHp - hero.currentHp);
    if (missing <= 0) {
      this.showToast("Hero is already at full health.");
      return;
    }

    const amount = Math.min(missing, Math.max(1, Math.floor(requestedAmount)));
    const cost = amount * HERO_TAVERN_HEAL_COST_PER_HP;

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createHealHeroInstruction({
        owner,
        heroId: hero.id,
        amount,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Healed ${amount} HP on Hero #${hero.id} for ${cost} gold.`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openTavern();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to heal hero.");
    } finally {
      this.programBusy = false;
    }
  }

  private healHeroToFull(hero: ChainHero) {
    const missing = Math.max(0, hero.maxHp - hero.currentHp);
    if (missing <= 0) {
      this.showToast("Hero is already at full health.");
      return;
    }
    void this.healHero(hero, missing);
  }

  private async relieveHeroStress(hero: ChainHero) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes cannot visit the abbey.");
      return;
    }
    if (hero.stress <= 0) {
      this.showToast("No stress to relieve for this hero.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createRelieveStressInstruction({
        owner,
        heroId: hero.id,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Abbey service complete for Hero #${hero.id} (cost ${HERO_ABBEY_COST}g).`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openAbbey();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to relieve stress.");
    } finally {
      this.programBusy = false;
    }
  }

  private async blessHero(hero: ChainHero) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes cannot visit the abbey.");
      return;
    }
    if (hero.blessed) {
      this.showToast("Hero is already blessed.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createApplyBlessingInstruction({
        owner,
        heroId: hero.id,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Blessing bestowed on Hero #${hero.id} (cost ${HERO_ABBEY_COST}g).`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openAbbey();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to bless hero.");
    } finally {
      this.programBusy = false;
    }
  }

  private async cureStatusEffect(hero: ChainHero, effectType: number) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes cannot visit the sanitarium.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createCureStatusEffectInstruction({
        owner,
        heroId: hero.id,
        effectType,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Status effect cured on Hero #${hero.id} (cost ${HERO_SANITARIUM_STATUS_CURE_COST}g).`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openSanitarium();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to cure status effect.");
    } finally {
      this.programBusy = false;
    }
  }

  private async cureNegativeTrait(hero: ChainHero, traitIndex: number) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Locked heroes cannot visit the sanitarium.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const initialized = await this.ensureEconomyInitialized();
      if (!initialized) {
        return;
      }

      const instruction = createCureNegativeTraitInstruction({
        owner,
        heroId: hero.id,
        traitIndex,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(
        `Negative trait cured on Hero #${hero.id} (cost ${HERO_SANITARIUM_TRAIT_CURE_COST}g).`
      );
      await this.syncEconomyFromChain();
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
        this.openSanitarium();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to cure negative trait.");
    } finally {
      this.programBusy = false;
    }
  }

  private async burnHero(hero: ChainHero) {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }
    if (this.programBusy) {
      this.showToast("Another transaction is processing.");
      return;
    }
    if (this.isHeroLocked(hero)) {
      this.showToast("Cannot burn a hero that is currently adventuring.");
      return;
    }

    if (!this.getSolanaConnection()) {
      this.showToast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);

    this.programBusy = true;
    try {
      const instruction = createBurnHeroInstruction({
        owner,
        heroId: hero.id,
      });

      await this.sendProgramTransaction([instruction]);
      this.showToast(`Hero #${hero.id} has been burned.`);
      await this.loadHeroes(this.walletAddress);
      if (this.modalPanel) {
        this.closeModal();
      }
    } catch (err) {
      this.handleProgramError(err, "Failed to burn hero.");
    } finally {
      this.programBusy = false;
    }
  }

  private getWalletProvider(): SolanaProvider | undefined {
    if (this.walletProvider) return this.walletProvider;
    if (typeof window === "undefined") return undefined;
    const candidate = (window as unknown as { solana?: SolanaProvider }).solana;
    if (candidate) {
      this.walletProvider = candidate;
      return candidate;
    }
    return undefined;
  }

  private resolveWalletAddress(
    key?: WalletPublicKey | string | null
  ): string | undefined {
    if (!key) return undefined;
    if (typeof key === "string") {
      return key;
    }
    try {
      return key.toBase58();
    } catch {
      try {
        return key.toString();
      } catch {
        return undefined;
      }
    }
  }

  private shortenAddress(address: string) {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  private renderHeroModalSection(
    panel: Phaser.GameObjects.Container,
    startY: number,
    renderer: (hero: ChainHero, offset: number) => number
  ) {
    if (!this.walletAddress) {
      panel.add(
        this.add
          .text(
            0,
            startY,
            "Connect your wallet to manage heroes.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );
      return startY + 24;
    }

    if (this.heroesLoading) {
      panel.add(
        this.add
          .text(0, startY, "Loading hero roster...", UI_FONT.body)
          .setOrigin(0, 0)
      );
      return startY + 24;
    }

    if (this.heroLoadError) {
      panel.add(
        this.add
          .text(0, startY, `Failed to load heroes: ${this.heroLoadError}`, {
            ...UI_FONT.body,
            color: "#ff8a8a",
            wordWrap: { width: 432 },
          })
          .setOrigin(0, 0)
      );
      return startY + 36;
    }

    if (!this.heroes.length) {
      panel.add(
        this.add
          .text(0, startY, "No heroes minted yet.", UI_FONT.body)
          .setOrigin(0, 0)
      );
      return startY + 24;
    }

    let offset = startY;
    this.heroes.forEach((hero) => {
      offset = renderer(hero, offset);
    });
    return offset;
  }

  private openBuilding(key: BuildingKey) {
    switch (key) {
      case "tavern":
        this.openTavern();
        break;
      case "sanitarium":
        this.openSanitarium();
        break;
      case "blacksmith":
        this.openBlacksmith();
        break;
      case "guild":
        this.openGuild();
        break;
      case "market":
        this.openMarket();
        break;
      case "abbey":
        this.openAbbey();
        break;
    }
  }

  private openModal(
    title: string,
    builder: (content: Phaser.GameObjects.Container, close: () => void) => void
  ) {
    this.closeModal();

    const maxW = Math.floor(this.scale.width * 0.7);
    const maxH = Math.floor(this.scale.height * 0.7);
    const baseW = 480;
    const baseH = 360;
    const padding = { top: 56, bottom: 16, left: 24, right: 24 }; // title+close area = 56

    // overlay
    this.modalOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
      .setOrigin(0)
      .setDepth(80)
      .setInteractive()
      .on("pointerdown", () => this.closeModal());

    // panel container
    this.modalPanel = this.add.container(0, 0).setDepth(81);

    // temp bg with base size (we'll relayout after measuring)
    const bg = this.add.rectangle(0, 0, baseW, baseH, 0x1a1f2b).setOrigin(0);
    bg.setStrokeStyle(2, 0x3c4252, 1);
    bg.setInteractive();
    this.modalPanel.add(bg);

    // title
    const titleText = this.add
      .text(24, 18, title, UI_FONT.heading)
      .setOrigin(0, 0);
    this.modalPanel.add(titleText);

    // close button (position updated after final width is known)
    const closeBtn = createButton(this, 0, 16, 92, "Close", () =>
      this.closeModal()
    );
    this.modalPanel.add(closeBtn);

    // content container (position anchored to padding)
    const content = this.add.container(padding.left, padding.top);
    this.modalPanel.add(content);

    // let the caller populate content
    builder(content, () => this.closeModal());

    // ---- Measure content and compute desired size ----
    // getBounds works on world space; we'll use width/height of content’s local children
    const contentBounds = content.getBounds(); // world bounds
    // content local width/height (account for children sizes). If empty, keep 0.
    const contentW = Math.max(0, Math.ceil(contentBounds.width));
    const contentH = Math.max(0, Math.ceil(contentBounds.height));

    // desired size = padding + content
    let desiredW = Math.max(baseW, padding.left + contentW + padding.right);
    let desiredH = Math.max(baseH, padding.top + contentH + padding.bottom);

    // cap to 70% of screen
    const panelW = Math.min(desiredW, maxW);
    const panelH = Math.min(desiredH, maxH);

    // apply final bg size (force display pipeline to update)
    bg.setSize(panelW, panelH); // updates the internal size
    bg.setDisplaySize(panelW, panelH); // ensures the rendered size matches
    bg.setStrokeStyle(2, 0x3c4252, 1); // re-assert stroke after size change

    // apply final bg size
    bg.width = panelW;
    bg.height = panelH;

    // position close button flush right
    closeBtn.setPosition(panelW - 92 - 16, 16);

    // center panel
    this.modalPanel.setPosition(
      snap((this.scale.width - panelW) / 2),
      snap((this.scale.height - panelH) / 2)
    );

    // ---- Scrolling if overflow ----
    const innerW = panelW - padding.left - padding.right;
    const innerH = panelH - padding.top - padding.bottom;

    // We’ll only add scroll in directions that actually overflow.
    let scrollY = 0;

    // Add a mask rect for the visible content area
    const maskRect = this.add.rectangle(
      this.modalPanel.x + padding.left + innerW / 2,
      this.modalPanel.y + padding.top + innerH / 2,
      innerW,
      innerH,
      0xffffff,
      0
    );
    const contentMask = maskRect.createGeometryMask();
    content.setMask(contentMask);

    // helper to clamp & apply scroll
    const applyContentScroll = () => {
      const maxScrollY = Math.max(0, contentH - innerH);
      if (maxScrollY <= 0) {
        scrollY = 0;
      } else {
        scrollY = Phaser.Math.Clamp(scrollY, -maxScrollY, 0);
      }
      content.y = padding.top + scrollY; // content is inside modalPanel, so keep offset from top padding
    };

    applyContentScroll();

    this.modalWheelHandler = (pointer, _objects, _dx, dy, _dz) => {
      const px = pointer.worldX ?? pointer.x;
      const py = pointer.worldY ?? pointer.y;

      const visibleRect = new Phaser.Geom.Rectangle(
        this.modalPanel!.x + padding.left,
        this.modalPanel!.y + padding.top,
        innerW,
        innerH
      );
      if (!visibleRect.contains(px, py)) return;

      if (contentH > innerH) {
        scrollY -= dy * 0.5; // adjust sensitivity if you want
        applyContentScroll();
      }
    };
    this.input.on("wheel", this.modalWheelHandler, this);
  }

  private closeModal() {
    if (this.modalWheelHandler) {
      this.input.off("wheel", this.modalWheelHandler, this);
      this.modalWheelHandler = undefined;
    }
    this.modalOverlay?.destroy();
    this.modalPanel?.destroy();
    this.modalOverlay = undefined;
    this.modalPanel = undefined;
  }

  private openTavern() {
    this.openModal("The Sable Hearth Tavern", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "On-chain heroes gather here between expeditions. Minted allies appear below once your wallet is connected.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      let offset = intro.height + 16;

      if (!this.walletAddress) {
        this.renderHeroModalSection(
          panel,
          offset,
          (_hero, innerOffset) => innerOffset
        );
        return;
      }

      if (this.playerProfile === undefined) {
        const loading = this.add
          .text(0, offset, "Loading player profile...", UI_FONT.body)
          .setOrigin(0, 0);
        panel.add(loading);
        offset = loading.y + loading.height + 16;
        this.renderHeroModalSection(
          panel,
          offset,
          (_hero, innerOffset) => innerOffset
        );
        return;
      }

      if (this.playerProfile === null) {
        const initBtn = createButton(
          this,
          0,
          offset,
          260,
          "Initialize Adventurer Ledger",
          () => this.initializePlayerProfile(),
          !this.programBusy
        );
        panel.add(initBtn);
        offset = initBtn.y + BUTTON_DIMENSIONS.height + 20;
        this.renderHeroModalSection(
          panel,
          offset,
          (_hero, innerOffset) => innerOffset
        );
        return;
      }

      if (!this.playerProfile) {
        this.renderHeroModalSection(
          panel,
          offset,
          (_hero, innerOffset) => innerOffset
        );
        return;
      }

      const profile = this.playerProfile;
      const freeRemaining = Math.max(
        0,
        HERO_FREE_MINT_LIMIT - profile.freeMintCount
      );
      const heroCapReached = profile.heroCount >= MAX_HEROES;
      const mintLabel =
        freeRemaining > 0
          ? `Summon Hero (${freeRemaining} free left)`
          : `Summon Hero (${HERO_PAID_COST} Gold)`;
      const mintEnabled =
        !heroCapReached && !this.programBusy && !this.heroesLoading;

      const mintBtn = createButton(
        this,
        0,
        offset,
        320,
        mintLabel,
        () => {
          this.mintHero();
        },
        mintEnabled
      );
      panel.add(mintBtn);

      const infoLines: string[] = [];
      infoLines.push(`Next hero ID: ${profile.nextHeroId.toString()}`);
      infoLines.push(`Roster: ${profile.heroCount}/${MAX_HEROES}`);
      if (heroCapReached) {
        infoLines.push("Roster is at capacity.");
      } else if (freeRemaining > 0) {
        infoLines.push(`${freeRemaining} free summons remaining.`);
      } else {
        infoLines.push("Further summons draw 100 gold from your vault.");
      }
      infoLines.push("Tavern staff heal injured heroes for 1 gold per HP.");

      const infoText = infoLines.join("\n");
      const info = this.add
        .text(0, mintBtn.y + BUTTON_DIMENSIONS.height + 8, infoText, {
          ...UI_FONT.caption,
          color: "#9fa6c0",
          wordWrap: { width: 432 },
        })
        .setOrigin(0, 0);
      panel.add(info);

      offset = info.y + info.height + 16;

      this.renderHeroModalSection(panel, offset, (hero, innerOffset) => {
        const block = this.add.container(0, innerOffset);
        const typeLabel = getHeroTypeLabel(hero.heroType);
        const title = this.add
          .text(0, 0, `Hero #${hero.id} — ${typeLabel}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(title);

        const details = this.add
          .text(
            0,
            title.height + 4,
            `Level ${hero.level} • Soulbound: ${
              hero.isSoulbound ? "Yes" : "No"
            }`,
            {
              ...UI_FONT.caption,
              color: "#c1c6db",
            }
          )
          .setOrigin(0, 0);
        block.add(details);

        const minted = this.add
          .text(
            0,
            details.y + details.height + 2,
            `Minted ${formatHeroTimestamp(hero.mintTimestamp)}`,
            {
              ...UI_FONT.caption,
              color: "#9fa6c0",
            }
          )
          .setOrigin(0, 0);
        block.add(minted);

        const hpLine = this.add
          .text(
            0,
            minted.y + minted.height + 4,
            `HP ${hero.currentHp}/${hero.maxHp}`,
            {
              ...UI_FONT.caption,
              color: hero.currentHp < hero.maxHp ? "#ffe28a" : "#8de9a3",
            }
          )
          .setOrigin(0, 0);
        block.add(hpLine);

        const locked = this.isHeroLocked(hero);
        const missingHp = Math.max(0, hero.maxHp - hero.currentHp);
        const healOneEnabled = missingHp > 0 && !locked && !this.programBusy;
        const healFullCost = missingHp * HERO_TAVERN_HEAL_COST_PER_HP;

        const healOneBtn = createButton(
          this,
          0,
          hpLine.y + hpLine.height + 8,
          170,
          `Heal +1 HP (${HERO_TAVERN_HEAL_COST_PER_HP}g)`,
          () => this.healHero(hero, 1),
          healOneEnabled
        );
        block.add(healOneBtn);

        const healFullBtn = createButton(
          this,
          190,
          hpLine.y + hpLine.height + 8,
          210,
          `Heal to Full (${healFullCost}g)`,
          () => this.healHeroToFull(hero),
          missingHp > 0 && !locked && !this.programBusy
        );
        block.add(healFullBtn);

        let blockBottom = Math.max(
          healOneBtn.y + BUTTON_DIMENSIONS.height,
          healFullBtn.y + BUTTON_DIMENSIONS.height
        );

        if (locked) {
          const lockedText = this.add
            .text(0, blockBottom + 4, "Hero is currently adventuring.", {
              ...UI_FONT.caption,
              color: "#ffb878",
            })
            .setOrigin(0, 0);
          block.add(lockedText);
          blockBottom = lockedText.y + lockedText.height;
        } else if (missingHp === 0) {
          const fullText = this.add
            .text(0, blockBottom + 4, "Already at full health.", {
              ...UI_FONT.caption,
              color: "#8de9a3",
            })
            .setOrigin(0, 0);
          block.add(fullText);
          blockBottom = fullText.y + fullText.height;
        }

        panel.add(block);
        return innerOffset + blockBottom + 18;
      });
    });
  }

  private openSanitarium() {
    this.openModal("Sanitarium of Calming Winds", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "Cure status effects (10g) and negative traits (25g) from your heroes.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      this.renderHeroModalSection(panel, intro.height + 16, (hero, offset) => {
        const block = this.add.container(0, offset);
        const header = this.add
          .text(0, 0, `Hero #${hero.id}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(header);

        let yPos = header.height + 4;

        // Status effects section
        const statusNames = ["Bleeding", "Poison", "Burn", "Chill"];
        const activeStatuses: number[] = [];
        for (let i = 0; i < 4; i++) {
          if ((hero.statusEffects & (1 << i)) !== 0) {
            activeStatuses.push(i);
          }
        }

        const statusText = this.add
          .text(
            0,
            yPos,
            activeStatuses.length > 0
              ? `Status Effects: ${activeStatuses
                  .map((i) => statusNames[i])
                  .join(", ")}`
              : "No active status effects.",
            {
              ...UI_FONT.caption,
              color: activeStatuses.length > 0 ? "#ffb878" : "#9fa6c0",
              wordWrap: { width: 432 },
            }
          )
          .setOrigin(0, 0);
        block.add(statusText);
        yPos = statusText.y + statusText.height + 4;

        // Cure status effect buttons
        if (activeStatuses.length > 0) {
          const locked = this.isHeroLocked(hero);
          activeStatuses.forEach((effectType, idx) => {
            const btn = createButton(
              this,
              idx * 110,
              yPos,
              100,
              `Cure ${statusNames[effectType]} (${HERO_SANITARIUM_STATUS_CURE_COST}g)`,
              () => this.cureStatusEffect(hero, effectType),
              !locked && !this.programBusy
            );
            block.add(btn);
          });
          yPos += BUTTON_DIMENSIONS.height + 8;
        }

        // Negative traits section
        const negativeTraits = hero.negativeQuirks.map((id) =>
          getQuirkLabel(id)
        );
        const traitsText = this.add
          .text(
            0,
            yPos,
            negativeTraits.length > 0
              ? `Negative Traits: ${negativeTraits.join(", ")}`
              : "No negative traits.",
            {
              ...UI_FONT.caption,
              color: negativeTraits.length > 0 ? "#ff9d7d" : "#9fa6c0",
              wordWrap: { width: 432 },
            }
          )
          .setOrigin(0, 0);
        block.add(traitsText);
        yPos = traitsText.y + traitsText.height + 4;

        // Cure trait buttons
        if (negativeTraits.length > 0) {
          const locked = this.isHeroLocked(hero);
          hero.negativeQuirks.forEach((traitId, idx) => {
            const btn = createButton(
              this,
              idx * 150,
              yPos,
              140,
              `Cure ${getQuirkLabel(
                traitId
              )} (${HERO_SANITARIUM_TRAIT_CURE_COST}g)`,
              () => this.cureNegativeTrait(hero, idx),
              !locked && !this.programBusy
            );
            block.add(btn);
          });
          yPos += BUTTON_DIMENSIONS.height + 8;
        }

        // Locked warning
        if (this.isHeroLocked(hero)) {
          const lockedText = this.add
            .text(0, yPos, "Hero must return from adventure first.", {
              ...UI_FONT.caption,
              color: "#ffb878",
            })
            .setOrigin(0, 0);
          block.add(lockedText);
          yPos = lockedText.y + lockedText.height;
        }

        panel.add(block);
        return offset + yPos + 16;
      });
    });
  }

  private openBlacksmith() {
    this.openModal("Iron & Ember Forge", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "Review your heroes' combat readiness. Attack, defense, and arcane focus are drawn directly from the on-chain mint.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      this.renderHeroModalSection(panel, intro.height + 16, (hero, offset) => {
        const block = this.add.container(0, offset);

        const header = this.add
          .text(0, 0, `Hero #${hero.id} — ${getHeroTypeLabel(hero.heroType)}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(header);

        const offense = this.add
          .text(
            0,
            header.height + 4,
            `Attack ${hero.attack} • Magic ${hero.magic} • Speed ${hero.speed}`,
            {
              ...UI_FONT.caption,
              color: "#c1c6db",
            }
          )
          .setOrigin(0, 0);
        block.add(offense);

        const defense = this.add
          .text(
            0,
            offense.y + offense.height + 2,
            `Defense ${hero.defense} • Resistance ${hero.resistance} • Luck ${hero.luck}`,
            {
              ...UI_FONT.caption,
              color: "#c1c6db",
            }
          )
          .setOrigin(0, 0);
        block.add(defense);

        const rerollInfo = this.add
          .text(
            0,
            defense.y + defense.height + 6,
            `Rerolls used: ${hero.rerollCount}/${HERO_BLACKSMITH_MAX_REROLLS}`,
            {
              ...UI_FONT.caption,
              color:
                hero.rerollCount >= HERO_BLACKSMITH_MAX_REROLLS
                  ? "#ff9c9c"
                  : "#9fa6c0",
            }
          )
          .setOrigin(0, 0);
        block.add(rerollInfo);

        const locked = this.isHeroLocked(hero);
        let blockBottom = rerollInfo.y + rerollInfo.height;

        if (locked) {
          const lockedText = this.add
            .text(0, blockBottom + 4, "Currently locked in an adventure.", {
              ...UI_FONT.caption,
              color: "#ffb878",
            })
            .setOrigin(0, 0);
          block.add(lockedText);
          blockBottom = lockedText.y + lockedText.height;
        } else if (hero.rerollCount >= HERO_BLACKSMITH_MAX_REROLLS) {
          const limitText = this.add
            .text(0, blockBottom + 4, "Reroll limit reached for this hero.", {
              ...UI_FONT.caption,
              color: "#ffb878",
            })
            .setOrigin(0, 0);
          block.add(limitText);
          blockBottom = limitText.y + limitText.height;
        }

        const buttonEnabled =
          !locked && hero.rerollCount < HERO_BLACKSMITH_MAX_REROLLS;
        const rerollButton = createButton(
          this,
          260,
          rerollInfo.y - 4,
          180,
          `Reroll (${HERO_BLACKSMITH_COST}g)`,
          () => this.rerollHeroStats(hero),
          buttonEnabled && !this.programBusy
        );
        block.add(rerollButton);
        blockBottom = Math.max(
          blockBottom,
          rerollButton.y + BUTTON_DIMENSIONS.height
        );

        panel.add(block);
        return offset + blockBottom + 16;
      });
    });
  }

  private openGuild() {
    this.openModal("Adventurers' Guild", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "Guild archivists keep record of each hero's signature abilities.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      this.renderHeroModalSection(panel, intro.height + 16, (hero, offset) => {
        const block = this.add.container(0, offset);
        const header = this.add
          .text(0, 0, `Hero #${hero.id} — ${getHeroTypeLabel(hero.heroType)}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(header);

        const skills =
          hero.skills
            .map((skill) => skill.name || `Skill ${skill.id}`)
            .join(", ") || "Unrevealed";
        const body = this.add
          .text(0, header.height + 4, skills, {
            ...UI_FONT.caption,
            color: "#c1c6db",
            wordWrap: { width: 432 },
          })
          .setOrigin(0, 0);
        block.add(body);

        const nextLevel = getNextLevelRequirement(hero);
        const requirementLabel = nextLevel
          ? `Next: Level ${nextLevel.targetLevel} (XP > ${nextLevel.requiredExperience})`
          : "Maximum level reached";
        const requirementText = this.add
          .text(0, body.y + body.height + 6, requirementLabel, {
            ...UI_FONT.caption,
            color: nextLevel ? "#9fa6c0" : "#6f758c",
          })
          .setOrigin(0, 0);
        block.add(requirementText);

        const pending = hero.pendingRequest !== 0;
        let blockBottom = requirementText.y + requirementText.height;
        if (pending) {
          const pendingText = this.add
            .text(
              0,
              requirementText.y + requirementText.height + 4,
              "Awaiting VRF settlement...",
              {
                ...UI_FONT.caption,
                color: "#ffb878",
              }
            )
            .setOrigin(0, 0);
          block.add(pendingText);
          blockBottom = pendingText.y + pendingText.height;
        } else if (nextLevel) {
          const levelButton = createButton(
            this,
            292,
            requirementText.y - 4,
            140,
            "Level Up",
            () => this.levelUpHero(hero),
            canLevelUpHero(hero)
          );
          block.add(levelButton);
          blockBottom = Math.max(
            blockBottom,
            levelButton.y + BUTTON_DIMENSIONS.height
          );
        }

        // Add burn button
        const locked = this.isHeroLocked(hero);
        const burnButton = createButton(
          this,
          0,
          blockBottom + 8,
          140,
          "Burn Hero",
          () => this.burnHero(hero),
          !locked && !this.programBusy
        );
        block.add(burnButton);
        blockBottom = burnButton.y + BUTTON_DIMENSIONS.height;

        if (locked) {
          const lockedText = this.add
            .text(160, burnButton.y + 4, "Cannot burn while adventuring", {
              ...UI_FONT.caption,
              color: "#ffb878",
            })
            .setOrigin(0, 0);
          block.add(lockedText);
        }

        panel.add(block);
        const blockHeight = blockBottom;
        return offset + blockHeight + 16;
      });
    });
  }

  private openMarket() {
    this.openModal("Night Market", (panel) => {
      let currentTab: "market" | "players" = "market";

      const marketContainer = this.add.container(0, 40);
      const playersContainer = this.add.container(0, 40).setVisible(false);

      const comingSoonText = this.add
        .text(220, 150, "Coming Soon", {
          ...UI_FONT.heading,
          align: "center",
        })
        .setOrigin(0.5);
      playersContainer.add(comingSoonText);

      const marketTab = this.add
        .text(0, 0, "Market", { ...UI_FONT.body, fontSize: "18px" })
        .setInteractive({ cursor: "pointer" });

      const playersTab = this.add
        .text(marketTab.width + 24, 0, "Players Market", {
          ...UI_FONT.body,
          fontSize: "18px",
        })
        .setInteractive({ cursor: "pointer" });

      const updateTabs = () => {
        marketTab.setColor(currentTab === "market" ? "#ffe28a" : "#c1c6db");
        playersTab.setColor(currentTab === "players" ? "#ffe28a" : "#c1c6db");
        marketContainer.setVisible(currentTab === "market");
        playersContainer.setVisible(currentTab === "players");
      };

      marketTab.on("pointerdown", () => {
        currentTab = "market";
        updateTabs();
      });

      playersTab.on("pointerdown", () => {
        currentTab = "players";
        updateTabs();
      });

      panel.add(marketTab);
      panel.add(playersTab);
      panel.add(marketContainer);
      panel.add(playersContainer);

      updateTabs();

      marketContainer.add(
        this.add
          .text(
            0,
            0,
            "Trade provisions to prepare for expeditions.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );

      let offset = 28;
      MARKET_ITEMS.forEach((item: ItemDefinition) => {
        const owned = this.store.getInventory().items[item.id] ?? 0;

        marketContainer.add(
          this.add
            .text(0, offset, `${item.name} — ${item.description}`, {
              ...UI_FONT.body,
              wordWrap: { width: 420 },
            })
            .setOrigin(0, 0)
        );
        offset += 28;

        marketContainer.add(
          this.add
            .text(0, offset, `Owned: ${owned}`, UI_FONT.caption)
            .setOrigin(0, 0)
        );

        marketContainer.add(
          createButton(
            this,
            240,
            offset - 6,
            110,
            `Buy (${item.buyPrice}g)`,
            () => {
              this.buyItemOnChain(item.id);
            }
          )
        );
        marketContainer.add(
          createButton(
            this,
            360,
            offset - 6,
            110,
            `Sell (+${item.sellPrice}g)`,
            () => {
              this.sellItemOnChain(item.id);
            },
            owned > 0
          )
        );
        offset += 40;
      });
    });
  }

  private openAbbey() {
    this.openModal("Abbey of the Dawn", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "A quiet refuge where heroes reflect on virtues earned. Review positive traits and blessings sourced from the chain.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      this.renderHeroModalSection(panel, intro.height + 16, (hero, offset) => {
        const block = this.add.container(0, offset);
        const header = this.add
          .text(0, 0, `Hero #${hero.id}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(header);

        const stressLine = this.add
          .text(
            0,
            header.height + 4,
            `Stress ${hero.stress}/${hero.stressMax} • Blessed: ${
              hero.blessed ? "Yes" : "No"
            }`,
            {
              ...UI_FONT.caption,
              color: hero.stress > 0 ? "#ffe28a" : "#98d1ff",
            }
          )
          .setOrigin(0, 0);
        block.add(stressLine);

        const virtues = hero.positiveQuirks
          .map((id) => getQuirkLabel(id))
          .join(", ");
        const virtuesText = this.add
          .text(
            0,
            stressLine.y + stressLine.height + 4,
            virtues ? `Virtues: ${virtues}` : "No virtues recorded yet.",
            {
              ...UI_FONT.caption,
              color: virtues ? "#8de9a3" : "#9fa6c0",
              wordWrap: { width: 432 },
            }
          )
          .setOrigin(0, 0);
        block.add(virtuesText);

        const locked = this.isHeroLocked(hero);

        const relieveButton = createButton(
          this,
          0,
          virtuesText.y + virtuesText.height + 8,
          200,
          `Relieve Stress (${HERO_ABBEY_COST}g)`,
          () => this.relieveHeroStress(hero),
          hero.stress > 0 && !locked && !this.programBusy
        );
        block.add(relieveButton);

        const blessButton = createButton(
          this,
          220,
          virtuesText.y + virtuesText.height + 8,
          180,
          `Bless (${HERO_ABBEY_COST}g)`,
          () => this.blessHero(hero),
          !hero.blessed && !locked && !this.programBusy
        );
        block.add(blessButton);

        let blockBottom = Math.max(
          relieveButton.y + BUTTON_DIMENSIONS.height,
          blessButton.y + BUTTON_DIMENSIONS.height
        );

        if (locked) {
          const lockedText = this.add
            .text(
              0,
              blockBottom + 4,
              "Hero must return from adventure before visiting the abbey.",
              {
                ...UI_FONT.caption,
                color: "#ffb878",
              }
            )
            .setOrigin(0, 0);
          block.add(lockedText);
          blockBottom = lockedText.y + lockedText.height;
        } else if (hero.blessed) {
          const blessedText = this.add
            .text(0, blockBottom + 4, "Already blessed for the next run.", {
              ...UI_FONT.caption,
              color: "#98d1ff",
            })
            .setOrigin(0, 0);
          block.add(blessedText);
          blockBottom = blessedText.y + blessedText.height;
        }

        panel.add(block);
        return offset + blockBottom + 16;
      });
    });
  }

  private bindInputs() {
    this.bindKey("keydown-ESC", () => this.handleEsc());
    this.bindKey("keydown-E", () => this.launchEmbark());
  }

  private handleEsc() {
    if (this.modalPanel) {
      this.closeModal();
      return;
    }
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
      return;
    }
    this.pauseOverlay = this.add.container(
      snap(this.scale.width / 2),
      snap(this.scale.height / 2)
    );
    this.pauseOverlay.setDepth(90);
    const bg = this.add.rectangle(0, 0, 300, 200, 0x1c202c).setOrigin(0.5);
    bg.setStrokeStyle(2, 0x3c4252, 1);
    this.pauseOverlay.add(bg);
    this.pauseOverlay.add(
      this.add.text(0, -70, "Pause", UI_FONT.heading).setOrigin(0.5)
    );
    this.pauseOverlay.add(
      this.add
        .text(0, -24, "Esc: Close panels\n1–6: Buildings\nE: Embark planner", {
          ...UI_FONT.body,
          align: "center",
        })
        .setOrigin(0.5, 0)
    );
    const resume = createButton(this, -80, 40, 160, "Resume", () =>
      this.handleEsc()
    );
    this.pauseOverlay.add(resume);
  }

  private launchEmbark() {
    if (!this.walletAddress) {
      this.showToast("Connect your wallet first.");
      return;
    }

    this.scene.launch("EmbarkScene", {
      heroes: [...this.heroes],
      heroesLoading: this.heroesLoading,
      heroLoadError: this.heroLoadError,
      walletAddress: this.walletAddress,
    });
    this.scene.pause();
  }

  private showToast(message: string) {
    if (!message) return;
    const container = this.add.container(0, 0);
    const bg = this.add.rectangle(0, 0, 420, 44, 0x252a38, 0.95).setOrigin(0.5);
    bg.setStrokeStyle(1, 0x3b4254, 1);
    container.add(bg);
    container.add(
      this.add
        .text(0, 0, message, {
          ...UI_FONT.body,
          align: "center",
          wordWrap: { width: 380 },
        })
        .setOrigin(0.5)
    );
    container.setAlpha(0);
    this.toastLayer.add(container);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 180,
    });
    this.toasts.push({ container, ttl: 2600 });
  }

  private bindKey(event: string, handler: () => void) {
    const kb = this.input.keyboard;
    if (!kb) return;
    const wrapped = () => handler();
    kb.on(event, wrapped);
    this.keyboardBindings.push({ event, handler: wrapped });
  }

  private releaseKeyboardBindings() {
    const kb = this.input.keyboard;
    if (!kb) {
      this.keyboardBindings = [];
      return;
    }
    this.keyboardBindings.forEach(({ event, handler }) => {
      kb.off(event, handler);
    });
    this.keyboardBindings = [];
  }
}
