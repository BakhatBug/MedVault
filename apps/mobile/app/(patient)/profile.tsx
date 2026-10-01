import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import { API_URL } from "../../lib/config";
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const router = useRouter();

  if (state.status !== "signed-in") {
    return (
      <ScreenContainer>
        <Text style={styles.muted}>Loading profile…</Text>
      </ScreenContainer>
    );
  }

  const { user } = state;
  const initials = (user.fullName ?? "Patient")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScreenContainer>
      {/* Patient Avatar Card */}
      <View style={styles.profileHeaderCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.userName}>{user.fullName ?? "Patient"}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.patientIdPill}>
              <Text style={styles.patientIdText}>{user.patientCode ?? "NO-ID"}</Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>PATIENT VAULT</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Access Menu */}
      <Text style={styles.sectionHeader}>SAFETY & ACCESS</Text>

      <Pressable
        onPress={() => router.push("/(patient)/emergency")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={[styles.actionIconBox, { backgroundColor: "#FEE2E2" }]}>
          <Ionicons name="qr-code-outline" size={22} color="#DC2626" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Emergency Medical QR</Text>
          <Text style={styles.actionSub}>
            Share blood type, allergies, and emergency medications with first responders.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/(patient)/access")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={[styles.actionIconBox, { backgroundColor: "#E0E7FF" }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#4F46E5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Doctor Access & Consent</Text>
          <Text style={styles.actionSub}>
            Zero-trust access control. Review incoming requests, grant temporary access, or revoke any time.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/(patient)/timeline")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={[styles.actionIconBox, { backgroundColor: "#CCFBF1" }]}>
          <Ionicons name="pulse-outline" size={22} color="#0D9488" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Health Timeline</Text>
          <Text style={styles.actionSub}>Longitudinal record of clinical diagnoses, labs, and medications.</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Account Info */}
      <Text style={styles.sectionHeader}>ACCOUNT DETAILS</Text>
      <View style={styles.card}>
        <Field label="Full Legal Name" value={user.fullName ?? "—"} />
        <Field label="Patient Vault Identifier" value={user.patientCode ?? "—"} highlight />
        <Field label="Verified Email" value={user.email} />
        <Field label="Security Role" value="Registered Patient" isLast />
      </View>

      {/* System & Security */}
      <Text style={styles.sectionHeader}>SYSTEM & SECURITY</Text>
      <View style={styles.card}>
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.primaryDark} style={{ marginRight: spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>End-to-End Audit Logged</Text>
            <Text style={styles.securitySub}>All doctor chart access requires active cryptographic consent.</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <Field label="API Endpoint" value={API_URL} small isLast />
      </View>

      {/* Sign Out */}
      <Pressable
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 6 }} />
        <Text style={styles.signOutText}>Sign Out of Vault</Text>
      </Pressable>

      <View style={{ height: spacing.xl }} />
    </ScreenContainer>
  );
}

function Field({
  label,
  value,
  highlight,
  small,
  isLast,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, !isLast && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          highlight && styles.fieldHighlight,
          small && styles.fieldSmall,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeaderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "800", color: colors.primaryText },
  profileHeaderText: { flex: 1 },
  userName: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  badgeRow: { flexDirection: "row", gap: spacing.xs + 2, marginTop: 4 },
  patientIdPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  patientIdText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  rolePill: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  roleText: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  actionSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  fieldBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fieldLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  fieldValue: { fontSize: 14, fontWeight: "600", color: colors.text, maxWidth: "60%" },
  fieldHighlight: { color: colors.primaryDark, fontWeight: "700" },
  fieldSmall: { fontSize: 11, color: colors.textMuted },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  securityTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  securitySub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.borderLight },
  signOutBtn: {
    flexDirection: "row",
    backgroundColor: colors.dangerLight,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  signOutText: { color: colors.dangerText, fontWeight: "700", fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
