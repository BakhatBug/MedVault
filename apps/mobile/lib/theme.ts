// Centralized colors/spacing so screens stay consistent without dragging in a
// full UI library. Light theme only for v0.12 — dark mode is a polish pass.

export const colors = {
  background: "#F7F9FB",
  surface: "#FFFFFF",
  border: "#E1E8ED",
  text: "#0A1F2C",
  textMuted: "#5B6C7A",
  primary: "#0B4F6C",
  primaryText: "#FFFFFF",
  danger: "#B23A48",
  success: "#1B7F4F",
  warning: "#C97B27",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;
