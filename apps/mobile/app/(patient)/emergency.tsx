import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
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
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function EmergencyScreen() {
  const { state } = useAuth();
  const disclosure = useEmergencyDisclosure();
  const update = useUpdateEmergencyDisclosure();
  const [pending, setPending] = useState<keyof EmergencyDisclosure | null>(null);

  if (state.status !== "signed-in") {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
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
      Alert.alert("Update Failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setPending(null);
    }
  }

  async function previewEmergencyPage() {
    if (!emergencyUrl) return;
    if (Platform.OS === "web") {
      window.open(emergencyUrl, "_blank");
    } else {
      await Linking.openURL(emergencyUrl);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Emergency Medical Card", headerBackTitle: "Home" }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Paramedic Notice Banner */}
        <View style={styles.banner}>
          <Text style={{ fontSize: 24 }}>🚑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Paramedic & First Responder Access</Text>
            <Text style={styles.bannerSub}>
              First responders can scan this QR code without phone passcode to instantly view critical emergency info
              you disclose.
            </Text>
          </View>
        </View>

        {/* QR Code Presentation Card */}
        <View style={styles.qrCard}>
          <View style={styles.qrFrame}>
            {emergencyUrl ? (
              <QRCode
                value={emergencyUrl}
                size={210}
                backgroundColor={colors.surface}
                color={colors.text}
              />
            ) : (
              <Text style={styles.muted}>Assigning Patient Code…</Text>
            )}
          </View>
          {patientCode ? (
            <View style={styles.codePill}>
              <Text style={styles.codePillLabel}>PATIENT ID:</Text>
              <Text style={styles.codePillValue}>{patientCode}</Text>
            </View>
          ) : null}

          {emergencyUrl ? (
            <Pressable
              onPress={previewEmergencyPage}
              style={({ pressed }) => [styles.previewBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.previewBtnText}>Open Public Emergency Telemetry ↗</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Disclosure Controls */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Publicly Disclosed Fields</Text>
          <Text style={styles.sectionSub}>Choose which data points appear on the emergency scan page</Text>
        </View>

        {disclosure.isLoading ? (
          <View style={styles.spinner}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : disclosure.error ? (
          <Text style={styles.error}>{(disclosure.error as Error).message}</Text>
        ) : disclosure.data ? (
          <View style={styles.toggleCard}>
            <ToggleRow
              icon="🩸"
              label="Blood Type"
              desc="Discloses ABO/Rh blood group"
              value={disclosure.data.disclosure.bloodType}
              pending={pending === "bloodType"}
              onToggle={() => toggle("bloodType", disclosure.data!.disclosure.bloodType)}
            />
            <ToggleRow
              icon="⚠️"
              label="Documented Allergies"
              desc="Severe drug & substance allergies"
              value={disclosure.data.disclosure.allergies}
              pending={pending === "allergies"}
              onToggle={() => toggle("allergies", disclosure.data!.disclosure.allergies)}
            />
            <ToggleRow
              icon="💊"
              label="Active Medications"
              desc="Current active prescriptions"
              value={disclosure.data.disclosure.currentMedications}
              pending={pending === "currentMedications"}
              onToggle={() =>
                toggle("currentMedications", disclosure.data!.disclosure.currentMedications)
              }
            />
            <ToggleRow
              icon="📞"
              label="Emergency Contacts"
              desc="Next of kin & primary care contact"
              value={disclosure.data.disclosure.emergencyContact}
              pending={pending === "emergencyContact"}
              onToggle={() =>
                toggle("emergencyContact", disclosure.data!.disclosure.emergencyContact)
              }
              isLast
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  value,
  pending,
  onToggle,
  isLast = false,
}: {
  icon: string;
  label: string;
  desc: string;
  value: boolean;
  pending: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !isLast && styles.toggleBorder]}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      {pending ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={value ? colors.primary : "#f4f3f4"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  banner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  bannerTitle: { fontSize: 15, fontWeight: "800", color: colors.dangerText },
  bannerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadows.md,
  },
  qrFrame: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.full,
    marginTop: spacing.md,
    gap: 6,
  },
  codePillLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  codePillValue: { fontSize: 13, fontWeight: "800", color: colors.text, letterSpacing: 0.5 },
  previewBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  previewBtnText: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  sectionHeaderRow: { marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  toggleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
  },
  toggleBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  toggleLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  toggleDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  spinner: { padding: spacing.xl, alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
