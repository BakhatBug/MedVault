import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import { API_URL } from "../../lib/config";
import { colors, radius, spacing } from "../../lib/theme";

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
  return (
    <ScreenContainer>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Field label="Name" value={user.fullName ?? "—"} />
        <Field label="Patient ID" value={user.patientCode ?? "—"} />
        <Field label="Email" value={user.email} />
        <Field label="Role" value={user.role.toLowerCase()} />
      </View>

      <Pressable
        onPress={() => router.push("/(patient)/access")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Doctor access</Text>
          <Text style={styles.actionSub}>Review pending requests, see who has access, revoke any time.</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(patient)/emergency")}
        style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>Emergency QR</Text>
          <Text style={styles.actionSub}>
            Show paramedics the critical info you choose — blood type, allergies, medications.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>App info</Text>
        <Field label="API" value={API_URL} small />
      </View>

      <Pressable
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function Field({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, small && { fontSize: 12 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 2 },
  fieldValue: { color: colors.text, fontSize: 14 },
  sectionTitle: { color: colors.text, fontWeight: "600", fontSize: 14, marginBottom: spacing.sm },
  signOut: {
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: "#FBEAEA",
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0CCD0",
  },
  signOutText: { color: colors.danger, fontWeight: "600", fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 13 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  actionTitle: { color: colors.text, fontWeight: "600", fontSize: 15 },
  actionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.md },
});
