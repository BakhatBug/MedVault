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
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
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
          <View style={styles.bannerIconBox}>
            <MaterialCommunityIcons name="ambulance" size={24} color="#DC2626" />
          </View>
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
              <Feather name="external-link" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.previewBtnText}>Open Public Emergency Page</Text>
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
              icon={<MaterialCommunityIcons name="water" size={22} color="#DC2626" />}
              label="Blood Type"
              desc="Discloses ABO/Rh blood group"
              value={disclosure.data.disclosure.bloodType}
              pending={pending === "bloodType"}
              onToggle={() => toggle("bloodType", disclosure.data!.disclosure.bloodType)}
            />
            <ToggleRow
              icon={<Ionicons name="alert-circle" size={22} color={colors.warning} />}
              label="Documented Allergies"
              desc="Severe drug & substance allergies"
              value={disclosure.data.disclosure.allergies}
              pending={pending === "allergies"}
              onToggle={() => toggle("allergies", disclosure.data!.disclosure.allergies)}
            />
            <ToggleRow
              icon={<MaterialCommunityIcons name="pill" size={22} color="#2563EB" />}
              label="Active Medications"
              desc="Current active prescriptions"
              value={disclosure.data.disclosure.currentMedications}
              pending={pending === "currentMedications"}
              onToggle={() =>
                toggle("currentMedications", disclosure.data!.disclosure.currentMedications)
              }
            />
            <ToggleRow
              icon={<Ionicons name="call" size={20} color="#059669" />}
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
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  pending: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !isLast && styles.toggleBorder]}>
      <View style={styles.toggleIconBox}>{icon}</View>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  banner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 14, fontWeight: "700", color: colors.dangerText },
  bannerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
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
    marginBottom: spacing.md,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  codePillLabel: { fontSize: 11, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
  codePillValue: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  previewBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  sectionHeaderRow: { marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  toggleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  toggleIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  toggleLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  toggleDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  spinner: { padding: spacing.xxl, alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
