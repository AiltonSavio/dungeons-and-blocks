export type BuildingKey =
  | "tavern"
  | "sanitarium"
  | "blacksmith"
  | "guild"
  | "market"
  | "abbey";

export type BuildingDef = {
  key: BuildingKey;
  label: string;
  caption: string;
  col: number;
  row: number;
};

export const ROSTER_WIDTH = 280;
export const BUILDING_WIDTH = 180;
export const BUILDING_HEIGHT = 120;
export const GRID_COLUMNS = 3;
export const GRID_ROWS = 2;

export const TOPBAR_HEIGHT = 64;
export const GOLD_PANEL_WIDTH = 180;
export const WALLET_PANEL_WIDTH = 220;
export const WALLET_PANEL_HEIGHT = 34;
export const AIRDROP_BUTTON_WIDTH = 150;
export const TOPBAR_RIGHT_PADDING = 16;
export const TOPBAR_GAP = 16;

export const BUILDINGS: BuildingDef[] = [
  {
    key: "tavern",
    label: "Tavern",
    caption: "Recruit & heal heroes",
    col: 0,
    row: 0,
  },
  {
    key: "sanitarium",
    label: "Sanitarium",
    caption: "Cure ailments & quirks",
    col: 2,
    row: 0,
  },
  {
    key: "blacksmith",
    label: "Blacksmith",
    caption: "Forge weapons & armor",
    col: 0,
    row: 1,
  },
  {
    key: "guild",
    label: "Guild",
    caption: "Train & equip skills",
    col: 2,
    row: 1,
  },
  {
    key: "market",
    label: "Market",
    caption: "Buy & sell supplies",
    col: 1,
    row: 0,
  },
  {
    key: "abbey",
    label: "Abbey",
    caption: "Ease stress & bless",
    col: 1,
    row: 1,
  },
];
