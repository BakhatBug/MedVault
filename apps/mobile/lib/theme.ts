// MediVault Design System — Clinical Precision & Modern Digital Health

export const colors = {
  // Brand & Primary Clinical Theme (Teal / Cyan)
  primary: "#0D9488",
  primaryDark: "#0F766E",
  primaryDeep: "#134E4A",
  primaryLight: "#F0FDFA",
  primaryMuted: "#CCFBF1",
  primaryText: "#FFFFFF",

  // Secondary Clinical Accents (Sky Blue)
  secondary: "#0284C7",
  secondaryLight: "#F0F9FF",
  secondaryMuted: "#E0F2FE",
  secondaryText: "#0369A1",

  // AI & Intelligence (Indigo / Violet)
  ai: "#6366F1",
  aiDark: "#4F46E5",
  aiLight: "#EEF2FF",
  aiMuted: "#E0E7FF",
  aiBorder: "#C7D2FE",
  aiGlow: "rgba(99, 102, 241, 0.15)",

  // Neutral Backgrounds & Surfaces
  background: "#F8FAFC",
  backgroundAlt: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F5F9",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F8FAFC",

  // Borders
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderSubtle: "#E2E8F0",
  borderFocus: "#0D9488",

  // Typography
  text: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  textInverse: "#FFFFFF",

  // Status & Clinical Alerts
  success: "#10B981",
  successDark: "#047857",
  successLight: "#ECFDF5",
  successBorder: "#A7F3D0",
  successText: "#047857",

  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  warningBorder: "#FDE68A",
  warningText: "#B45309",

  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerText: "#B91C1C",

  info: "#3B82F6",
  infoLight: "#EFF6FF",
  infoBorder: "#BFDBFE",
  infoText: "#1D4ED8",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const shadows = {
  none: {},
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  xl: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  ai: {
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
} as const;
