import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import { API_URL } from "../../lib/config";
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function DoctorProfileScreen() {
  const { state, signOut } = useAuth();

  if (state.status !== "signed-in") {
    return (
      <ScreenContainer>
        <Text style={styles.muted}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const { user } = state;
  const initials = (user.fullName ?? "Doctor")
    .replace(/^Dr\.\s*/i, "")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScreenContainer>
      {/* Clinician Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials || "DR"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.doctorName}>{user.fullName ?? "Physician"}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.primaryDark} style={{ marginRight: 3 }} />
              <Text style={styles.verifiedText}>VERIFIED CLINICIAN</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Clinical Credentials Card */}
      <Text style={styles.sectionHeader}>CREDENTIALS & AFFILIATION</Text>
      <View style={styles.card}>
        <Field label="Medical Practitioner" value={user.fullName ?? "—"} />
        <Field label="Account Email" value={user.email} />
        <Field label="Clinical Role" value="Attending Physician" />
        <Field label="Verification Status" value="Active / Board Verified" highlight isLast />
      </View>

      {/* Decision Support & Privacy */}
      <Text style={styles.sectionHeader}>AI CLINICAL PROTOCOLS</Text>
      <View style={styles.card}>
        <View style={styles.aiProtocolRow}>
          <View style={styles.aiIconBox}>
            <Ionicons name="sparkles" size={20} color={colors.aiDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiProtocolTitle}>FHIR R4 + Gemini 2.5 Clinical Engine</Text>
            <Text style={styles.aiProtocolSub}>
              All chart summaries, lab analyses, and drug conflict detections cite original diagnostic source documents.
            </Text>
          </View>
        </View>
      </View>

      {/* Connectivity & Info */}
      <Text style={styles.sectionHeader}>SYSTEM & TELEMETRY</Text>
      <View style={styles.card}>
        <Field label="API Endpoint" value={API_URL} small isLast />
      </View>

      {/* Sign Out */}
      <Pressable
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 6 }} />
        <Text style={styles.signOutText}>Sign Out of Clinical Portal</Text>
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
          highlight && { color: colors.success, fontWeight: "700" },
          small && { fontSize: 12, fontFamily: "monospace" },
        ]}
      >
        {value}
      </Text>
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 20,
  },
  doctorName: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  badgeRow: { flexDirection: "row", marginTop: 4 },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  verifiedText: { fontSize: 10, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  fieldLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  fieldValue: { fontSize: 14, fontWeight: "600", color: colors.text, maxWidth: "60%" },
  aiProtocolRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  aiIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.aiLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aiProtocolTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  aiProtocolSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  signOut: {
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
