import { Pressable, StyleSheet, Text, View } from "react-native";
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
              <Text style={styles.verifiedText}>✓ VERIFIED CLINICIAN</Text>
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
          <Text style={styles.aiProtocolEmoji}>🧠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiProtocolTitle}>FHIR + Gemini 1.5 Clinical Engine</Text>
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
    width: 64,
    height: 64,
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
  doctorName: {
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
  verifiedPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  verifiedText: {
    color: colors.successDark,
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
  aiProtocolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  aiProtocolEmoji: {
    fontSize: 22,
  },
  aiProtocolTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  aiProtocolSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
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

