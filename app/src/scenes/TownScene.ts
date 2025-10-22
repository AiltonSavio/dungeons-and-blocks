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
import {
  ItemDefinition,
  MARKET_ITEMS,
  MAX_HEROES,
  TownState,
} from "../state/models";
import {
  SAFE_MARGIN,
  UI_FONT,
  PANEL_COLORS,
  BUTTON_DIMENSIONS,
  snap,
} from "../ui/uiConfig";
import { setInventoryVisible } from "../ui/hudControls";
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
  createLevelUpInstruction,
  getNextLevelRequirement,
} from "../state/heroChain";

import {
  BuildingKey,
  GOLD_PANEL_WIDTH,
  WALLET_PANEL_HEIGHT,
  WALLET_PANEL_WIDTH,
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

export class TownScene extends Phaser.Scene {
  private safe = SAFE_MARGIN;
  private store = townStore;
  private state!: TownState;

  private worldLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private tooltipLayer!: Phaser.GameObjects.Container;
  private toastLayer!: Phaser.GameObjects.Container;

  private rosterPanel!: RosterPanel;
  private expandedHeroId?: number;

  private goldPanel!: Phaser.GameObjects.Container;
  private embarkedCTA!: Phaser.GameObjects.Container;

  private walletPanel!: Phaser.GameObjects.Container;
  private walletStatusText?: Phaser.GameObjects.Text;
  private walletProvider?: SolanaProvider;
  private walletAddress?: string;
  private walletBusy = false;
  private walletConnectHandler?: (publicKey: WalletPublicKey) => void;
  private walletDisconnectHandler?: () => void;
  private solanaConnection?: Connection;
  private heroes: ChainHero[] = [];
  private heroesLoading = false;
  private heroLoadError?: string;
  private playerProfile: PlayerProfile | null | undefined;
  private programBusy = false;

  private plazaCenterX = 0;
  private plazaCenterY = 0;
  private plazaRadius = 120;

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
    this.state = this.store.getState();
  }

  create() {
    this.worldLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0).setDepth(10);
    this.tooltipLayer = this.add.container(0, 0).setDepth(50);
    this.toastLayer = this.add
      .container(this.scale.width / 2, this.safe)
      .setDepth(60);

    const hideInventory = () => setInventoryVisible(false);
    hideInventory();
    this.events.on(Phaser.Scenes.Events.RESUME, hideInventory);

    this.releaseKeyboardBindings();

    const background = renderBackground(this, this.safe, this.worldLayer);
    this.plazaCenterX = background.centerX;
    this.plazaCenterY = background.centerY;
    this.plazaRadius = background.radius;

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

    this.embarkedCTA = renderEmbarkCTA({
      scene: this,
      centerX: this.plazaCenterX,
      centerY: this.plazaCenterY,
      uiLayer: this.uiLayer,
      createButton: (x, y, width, label, handler, enabled) =>
        createButton(this, x, y, width, label, handler, enabled),
      onEmbark: () => this.launchEmbark(),
    });

    this.bindInputs();

    this.unsubChange = this.store.subscribe((state) => {
      this.state = state;
      this.refreshUI();
    });
    this.unsubToast = this.store.onToast((message) => this.showToast(message));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubChange?.();
      this.unsubToast?.();
      this.events.off(Phaser.Scenes.Events.RESUME, hideInventory);
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
    this.updateRosterPanel();
  }

  private updateRosterPanel() {
    const rosterState: RosterPanelState = {
      walletAddress: this.walletAddress,
      heroes: this.heroes,
      heroesLoading: this.heroesLoading,
      heroLoadError: this.heroLoadError,
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
      walletAddress: this.walletAddress,
    });
  }

  private renderGold() {
    this.goldPanel.removeAll(true);
    const gold = this.state.inventory.gold;
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
    };

    this.walletDisconnectHandler = () => {
      this.walletAddress = undefined;
      this.walletBusy = false;
      this.heroes = [];
      this.heroesLoading = false;
      this.heroLoadError = undefined;
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
      this.heroes = heroes.filter((hero) => (hero.pendingRequest ?? 0) === 0);
      this.playerProfile = profile;
    } catch (error) {
      if (this.walletAddress !== requestOwner) return;
      const message =
        error instanceof Error ? error.message : "Failed to load heroes.";
      this.heroLoadError = message;
      this.heroes = [];
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
    const instruction = createLevelUpInstruction({
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

    // UNCOMMENT TO DEBUG: Try to simulate first to catch errors
    // console.log("Attempting transaction simulation...");
    // try {
    //   const simulation = await connection.simulateTransaction(tx);
    //   if (simulation.value.err) {
    //     console.error("Simulation error:", simulation.value.err);
    //     console.error("Simulation logs:", simulation.value.logs);
    //     throw new Error(
    //       `Simulation failed: ${JSON.stringify(simulation.value.err)}`
    //     );
    //   } else {
    //     console.log("Simulation successful");
    //     console.log("Simulation logs:", simulation.value.logs);
    //   }
    // } catch (simErr) {
    //   console.error(
    //     "Simulation attempt failed (this might be expected):",
    //     simErr
    //   );
    // }

    // Sign the transaction
    let signature: string;
    try {
      if (provider.signAndSendTransaction) {
        const result = await provider.signAndSendTransaction(tx);
        signature =
          typeof result === "string" ? result : result.signature ?? "";
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error("Wallet does not support transaction signing.");
      }

      if (!signature) {
        throw new Error("Transaction signature missing.");
      }
    } catch (err) {
      throw err;
    }

    // Wait for confirmation
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

      return signature;
    } catch (err) {
      throw err;
    }
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
      .setInteractive();

    // panel container
    this.modalPanel = this.add.container(0, 0).setDepth(81);

    // temp bg with base size (we'll relayout after measuring)
    const bg = this.add.rectangle(0, 0, baseW, baseH, 0x1a1f2b).setOrigin(0);
    bg.setStrokeStyle(2, 0x3c4252, 1);
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

        panel.add(block);
        const blockHeight = minted.y + minted.height;
        return innerOffset + blockHeight + 18;
      });
    });
  }

  private openSanitarium() {
    this.openModal("Sanitarium of Calming Winds", (panel) => {
      const intro = this.add
        .text(
          0,
          0,
          "Track and remedy persistent afflictions from your on-chain roster.",
          {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          }
        )
        .setOrigin(0, 0);
      panel.add(intro);

      this.renderHeroModalSection(panel, intro.height + 16, (hero, offset) => {
        const ailments = hero.negativeQuirks.map((id) => getQuirkLabel(id));
        const summary =
          ailments.length > 0
            ? ailments.join(", ")
            : "No negative traits detected.";

        const block = this.add.container(0, offset);
        const header = this.add
          .text(0, 0, `Hero #${hero.id}`, {
            ...UI_FONT.body,
            color: "#f4f6ff",
          })
          .setOrigin(0, 0);
        block.add(header);

        const detail = this.add
          .text(0, header.height + 4, summary, {
            ...UI_FONT.caption,
            color: ailments.length ? "#ff9d7d" : "#9fa6c0",
            wordWrap: { width: 432 },
          })
          .setOrigin(0, 0);
        block.add(detail);

        panel.add(block);
        const blockHeight = detail.y + detail.height;
        return offset + blockHeight + 16;
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

        panel.add(block);
        const blockHeight = defense.y + defense.height;
        return offset + blockHeight + 16;
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

        panel.add(block);
        const blockHeight = blockBottom;
        return offset + blockHeight + 16;
      });
    });
  }

  private openMarket() {
    this.openModal("Night Market", (panel) => {
      panel.add(
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
        const owned = this.state.inventory.items[item.id] ?? 0;

        panel.add(
          this.add
            .text(0, offset, `${item.name} — ${item.description}`, {
              ...UI_FONT.body,
              wordWrap: { width: 420 },
            })
            .setOrigin(0, 0)
        );
        offset += 20;

        panel.add(
          this.add
            .text(0, offset, `Owned: ${owned}`, UI_FONT.caption)
            .setOrigin(0, 0)
        );

        panel.add(
          createButton(
            this,
            240,
            offset - 6,
            110,
            `Buy (${item.buyPrice}g)`,
            () => {
              const res = this.store.marketBuy(item.id, 1);
              this.showToast(res.message || "");
            }
          )
        );
        panel.add(
          createButton(
            this,
            360,
            offset - 6,
            110,
            `Sell (+${item.sellPrice}g)`,
            () => {
              const res = this.store.marketSell(item.id, 1);
              this.showToast(res.message || "");
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

        const virtues = hero.positiveQuirks
          .map((id) => getQuirkLabel(id))
          .join(", ");
        const text = virtues || "No virtues recorded yet.";

        const body = this.add
          .text(0, header.height + 4, text, {
            ...UI_FONT.caption,
            color: virtues ? "#8de9a3" : "#9fa6c0",
            wordWrap: { width: 432 },
          })
          .setOrigin(0, 0);
        block.add(body);

        panel.add(block);
        const blockHeight = body.y + body.height;
        return offset + blockHeight + 16;
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
