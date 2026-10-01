import { View, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { colors, radius } from "../lib/theme";

export type MedicalCategoryType =
  | "PRESCRIPTION"
  | "LAB_RESULT"
  | "IMAGING"
  | "DISCHARGE_SUMMARY"
  | "CONSULTATION_NOTE"
  | "OTHER"
  | "AI"
  | "EMERGENCY"
  | "TIMELINE"
  | "MEDICATION"
  | "DOCTOR"
  | "CARE";

type Props = {
  category?: MedicalCategoryType | string;
  type?: MedicalCategoryType | string;
  size?: number;
  iconSize?: number;
  style?: ViewStyle;
  variant?: "solid" | "subtle" | "plain";
};

export function MedicalIcon({
  category,
  type,
  size = 40,
  iconSize,
  style,
  variant = "subtle",
}: Props) {
  const norm = ((category || type || "") as string).toUpperCase();
  const actualIconSize = iconSize || Math.round(size * 0.52);

  let iconName: any = "document-text-outline";
  let iconFamily: "ionicons" | "material" | "feather" = "ionicons";
  let bg: string = colors.primaryLight;
  let fg: string = colors.primary;

  switch (norm) {
    case "PRESCRIPTION":
    case "MEDICATION":
    case "MEDICATIONS":
      iconFamily = "material";
      iconName = "pill";
      bg = "#EFF6FF";
      fg = "#2563EB";
      break;

    case "LAB_RESULT":
    case "LAB":
    case "TEST":
      iconFamily = "material";
      iconName = "flask-round-bottom-outline";
      bg = "#ECFDF5";
      fg = "#059669";
      break;

    case "IMAGING":
    case "XRAY":
    case "SCAN":
      iconFamily = "material";
      iconName = "radiology-box-outline";
      bg = "#F5F3FF";
      fg = "#7C3AED";
      break;

    case "DISCHARGE_SUMMARY":
    case "SUMMARY":
      iconFamily = "material";
      iconName = "clipboard-pulse-outline";
      bg = "#FFFBEB";
      fg = "#D97706";
      break;

    case "CONSULTATION_NOTE":
    case "NOTE":
      iconFamily = "ionicons";
      iconName = "document-text-outline";
      bg = "#F0FDFA";
      fg = "#0D9488";
      break;

    case "AI":
    case "AI_INSIGHTS":
    case "INTELLIGENCE":
      iconFamily = "ionicons";
      iconName = "sparkles";
      bg = "#EEF2FF";
      fg = "#6366F1";
      break;

    case "EMERGENCY":
    case "ALERT":
      iconFamily = "material";
      iconName = "heart-flash";
      bg = "#FEF2F2";
      fg = "#E11D48";
      break;

    case "TIMELINE":
    case "HISTORY":
      iconFamily = "ionicons";
      iconName = "pulse-outline";
      bg = "#F0FDF4";
      fg = "#16A34A";
      break;

    case "DOCTOR":
    case "PHYSICIAN":
      iconFamily = "material";
      iconName = "stethoscope";
      bg = "#F0FDFA";
      fg = "#0F766E";
      break;

    case "CARE":
    case "CAREGIVER":
      iconFamily = "ionicons";
      iconName = "people-outline";
      bg = "#FDF2F8";
      fg = "#DB2777";
      break;

    default:
      iconFamily = "ionicons";
      iconName = "document-outline";
      bg = "#F1F5F9";
      fg = "#475569";
      break;
  }

  const renderIcon = (color: string) => {
    if (iconFamily === "material") {
      return <MaterialCommunityIcons name={iconName} size={actualIconSize} color={color} />;
    }
    return <Ionicons name={iconName} size={actualIconSize} color={color} />;
  };

  if (variant === "plain") {
    return renderIcon(fg);
  }

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: variant === "solid" ? fg : bg,
        },
        style,
      ]}
    >
      {renderIcon(variant === "solid" ? "#FFFFFF" : fg)}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
});
