import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../lib/api";
import { useOutgoingAccess, useRequestAccess } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

const PATIENT_CODE_REGEX = /^MVK-\d{4}-\d{5,}$/i;

export default function DoctorDashboard() {
  const router = useRouter();
  const outgoing = useOutgoingAccess();
  const request = useRequestAccess();

  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Active grants surface as quick-tap "recent patient" cards.
  const activeGrants = useMemo(
    () => outgoing.data?.items.filter((p) => p.status === "APPROVED") ?? [],
    [outgoing.data],
  );

  const codeUpper = code.trim().toUpperCase();
  const canSubmit = PATIENT_CODE_REGEX.test(codeUpper) && !submitting;

  async function submitRequest() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await request.mutateAsync({ patientCode: codeUpper, ...(note.trim() ? { note: note.trim() } : {}) });
      Alert.alert(
        "Request sent",
        "The patient has been notified. You'll get access as soon as they approve.",
        [{ text: "OK" }],
      );
      setCode("");
      setNote("");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not send request.";
      Alert.alert("Request failed", msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={outgoing.isFetching}
              onRefresh={() => void outgoing.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={styles.title}>Patient lookup</Text>
          <Text style={styles.subtitle}>
            Enter a patient&apos;s MediVault ID to request access. They&apos;ll be notified to approve in their app.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Patient ID</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="MVK-2026-00001"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              editable={!submitting}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Reason for access (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Pre-visit chart review"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.notes]}
              multiline
              numberOfLines={2}
              editable={!submitting}
            />

            <Pressable
              onPress={submitRequest}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.button,
                !canSubmit && { opacity: 0.55 },
                pressed && canSubmit && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>Request access</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Active patients</Text>
          {outgoing.isLoading ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : activeGrants.length === 0 ? (
            <Text style={styles.muted}>No active grants yet. Request access to a patient above.</Text>
          ) : (
            activeGrants.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: "/(doctor)/patient/[code]", params: { code: g.patient.patientCode } })}
                style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.92 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{g.patient.fullName}</Text>
                  <Text style={styles.patientCode}>{g.patient.patientCode}</Text>
                  {g.expiresAt ? (
                    <Text style={styles.patientMeta}>Access expires {formatDate(g.expiresAt)}</Text>
                  ) : (
                    <Text style={styles.patientMeta}>Permanent access</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  notes: { minHeight: 60, textAlignVertical: "top" },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md, color: colors.text, fontWeight: "600", fontSize: 16 },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  patientName: { color: colors.text, fontWeight: "600", fontSize: 14 },
  patientCode: { color: colors.textMuted, fontSize: 12, marginTop: 2, letterSpacing: 0.5 },
  patientMeta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
});
