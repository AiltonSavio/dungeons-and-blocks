export const SAFE_MARGIN = 48;

export const UI_FONT = {
  title: { fontFamily: "monospace", fontSize: "24px", color: "#f4f6ff" },
  heading: { fontFamily: "monospace", fontSize: "18px", color: "#f4f6ff" },
  subheading: { fontFamily: "monospace", fontSize: "16px", color: "#cfd3e6" },
  body: { fontFamily: "monospace", fontSize: "13px", color: "#d5d9ec" },
  caption: { fontFamily: "monospace", fontSize: "11px", color: "#a6abc0" },
};

export const PANEL_COLORS = {
  background: 0x1f2330,
  stroke: 0x3c4252,
  highlight: 0x35527d,
  hover: 0x416392,
  disabled: 0x2b2f3f,
};

export const BUTTON_DIMENSIONS = {
  height: 32,
  minWidth: 140,
  paddingX: 14,
};

export function snap(value: number) {
  return Math.round(value);
}

