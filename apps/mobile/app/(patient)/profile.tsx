import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
          <Text style={styles.actionEmoji}>🚨</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Emergency Medical QR</Text>
          <Text style={styles.actionSub}>
            Share blood type, allergies, and emergency medications with first responders.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(patient)/access")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={[styles.actionIconBox, { backgroundColor: "#E0E7FF" }]}>
          <Text style={styles.actionEmoji}>🛡️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Doctor Access & Consent</Text>
          <Text style={styles.actionSub}>
            Zero-trust access control. Review incoming requests, grant temporary access, or revoke any time.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(patient)/timeline")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={[styles.actionIconBox, { backgroundColor: "#CCFBF1" }]}>
          <Text style={styles.actionEmoji}>📈</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Health Timeline</Text>
          <Text style={styles.actionSub}>Longitudinal record of clinical diagnoses, labs, and medications.</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
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
          <Text style={styles.securityIcon}>🔒</Text>
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
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.signOutText}>Sign Out of Vault</Text>
      </Pressable>

      <View style={{ height: spacing.xxl }} />
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
    <View style={[styles.field, isLast && { borderBottomWidth: 0 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          highlight && { color: colors.primary, fontWeight: "700" },
          small && { fontSize: 12, fontFamily: "monospace" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeaderCard: {
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
  profileHeaderText: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  patientIdPill: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  patientIdText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rolePill: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  roleText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
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
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
    gap: spacing.md,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionEmoji: {
    fontSize: 20,
  },
  actionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  actionSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: "300",
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  securityIcon: {
    fontSize: 22,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  securitySub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
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

