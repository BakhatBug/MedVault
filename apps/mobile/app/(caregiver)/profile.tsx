import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import { API_URL } from "../../lib/config";
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function CaregiverProfileScreen() {
  const { state, signOut } = useAuth();

  if (state.status !== "signed-in") {
    return (
      <ScreenContainer>
        <Text style={styles.muted}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const { user } = state;
  const initials = (user.fullName ?? "Caregiver")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScreenContainer>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials || "CG"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.fullName ?? "Caregiver"}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>AUTHORIZED CAREGIVER</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Account Info */}
      <Text style={styles.sectionHeader}>ACCOUNT & SECURITY</Text>
      <View style={styles.card}>
        <Field label="Full Name" value={user.fullName ?? "—"} />
        <Field label="Registered Email" value={user.email} />
        <Field label="Authorization Role" value="Caregiver Proxy (Family Access)" isLast />
      </View>

      {/* System & Telemetry */}
      <Text style={styles.sectionHeader}>SYSTEM CONNECTIVITY</Text>
      <View style={styles.card}>
        <Field label="API Endpoint" value={API_URL} small isLast />
      </View>

      {/* Sign Out */}
      <Pressable
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.signOutText}>Sign Out of Caregiver Portal</Text>
      </Pressable>

      <View style={{ height: spacing.xxl }} />
    </ScreenContainer>
  );
}

function Field({
  label,
  value,
  small,
  isLast,
}: {
  label: string;
  value: string;
  small?: boolean;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.field, isLast && { borderBottomWidth: 0 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, small && { fontSize: 12, fontFamily: "monospace" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadows.sm,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  rolePill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  roleText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs + 2,
    marginLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  field: {
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 3,
  },
  fieldValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  signOut: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerLight,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  signOutText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 15,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

