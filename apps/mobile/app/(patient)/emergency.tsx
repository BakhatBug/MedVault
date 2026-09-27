import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "../../lib/auth-context";
import { API_URL, API_PREFIX } from "../../lib/config";
import {
  type EmergencyDisclosure,
  useEmergencyDisclosure,
  useUpdateEmergencyDisclosure,
} from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

// Renders the emergency QR for the patient's own patient_code. Scanning the QR
// hits /v1/emergency/:patientCode which returns the disclosed subset of fields
// without auth — the paramedic scenario from spec §4.2.6.
export default function EmergencyScreen() {
  const { state } = useAuth();
  const disclosure = useEmergencyDisclosure();
  const update = useUpdateEmergencyDisclosure();
  const [pending, setPending] = useState<keyof EmergencyDisclosure | null>(null);

  if (state.status !== "signed-in") {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const patientCode = state.user.patientCode;
  const emergencyUrl = patientCode ? `${API_URL}${API_PREFIX}/emergency/${patientCode}` : null;

  async function toggle(field: keyof EmergencyDisclosure, current: boolean) {
    setPending(field);
    try {
      await update.mutateAsync({ [field]: !current });
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Emergency QR", headerBackTitle: "Profile" }} />
      <View style={styles.scroll}>
        <Text style={styles.h1}>Your emergency QR</Text>
        <Text style={styles.sub}>
          A paramedic can scan this without unlocking your phone to see the critical info you choose to share.
        </Text>

        <View style={styles.qrCard}>
          {emergencyUrl ? (
            <QRCode
              value={emergencyUrl}
              size={200}
              backgroundColor={colors.surface}
              color={colors.text}
            />
          ) : (
            <Text style={styles.muted}>Patient ID not assigned yet.</Text>
          )}
          {patientCode ? <Text style={styles.code}>{patientCode}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>What appears when scanned</Text>
        <Text style={styles.sectionSub}>Toggle off anything you don&apos;t want disclosed publicly.</Text>

        {disclosure.isLoading ? (
          <View style={styles.spinner}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : disclosure.error ? (
          <Text style={styles.error}>{(disclosure.error as Error).message}</Text>
        ) : disclosure.data ? (
          <View style={styles.toggleCard}>
            <ToggleRow
              label="Blood type"
              value={disclosure.data.disclosure.bloodType}
              pending={pending === "bloodType"}
              onToggle={() => toggle("bloodType", disclosure.data!.disclosure.bloodType)}
            />
            <ToggleRow
              label="Allergies"
              value={disclosure.data.disclosure.allergies}
              pending={pending === "allergies"}
              onToggle={() => toggle("allergies", disclosure.data!.disclosure.allergies)}
            />
            <ToggleRow
              label="Current medications"
              value={disclosure.data.disclosure.currentMedications}
              pending={pending === "currentMedications"}
              onToggle={() => toggle("currentMedications", disclosure.data!.disclosure.currentMedications)}
            />
            <ToggleRow
              label="Emergency contact"
              value={disclosure.data.disclosure.emergencyContact}
              pending={pending === "emergencyContact"}
              onToggle={() => toggle("emergencyContact", disclosure.data!.disclosure.emergencyContact)}
              last
            />
          </View>
        ) : null}

        <Pressable
          onPress={() => emergencyUrl && Alert.alert("Emergency URL", emergencyUrl)}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.linkBtnText}>Show URL</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          {Platform.OS === "ios" ? "Tip" : "Note"}: anyone with this QR (or the URL it encodes) can see the disclosed
          fields. Don&apos;t share screenshots publicly.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  value,
  pending,
  onToggle,
  last,
}: {
  label: string;
  value: boolean;
  pending: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {pending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.lg },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  code: { marginTop: spacing.md, color: colors.textMuted, fontSize: 13, letterSpacing: 1 },
  sectionTitle: { marginTop: spacing.xl, color: colors.text, fontWeight: "600", fontSize: 15 },
  sectionSub: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, marginBottom: spacing.md },
  toggleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleLabel: { color: colors.text, fontSize: 14 },
  linkBtn: { marginTop: spacing.lg, alignSelf: "center" },
  linkBtnText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  disclaimer: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  spinner: { paddingVertical: spacing.lg, alignItems: "center" },
  error: { color: colors.danger, fontSize: 13 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
