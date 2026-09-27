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
import { useAuth } from "../../lib/auth-context";
import { useOutgoingAccess, useRequestAccess } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

const PATIENT_CODE_REGEX = /^MVK-\d{4}-\d{5,}$/i;

export default function DoctorDashboard() {
  const { state } = useAuth();
  const router = useRouter();
  const outgoing = useOutgoingAccess();
  const request = useRequestAccess();

  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const docName = state.status === "signed-in" ? state.user.fullName ?? "Doctor" : "Doctor";

  const activeGrants = useMemo(
    () => outgoing.data?.items.filter((p) => p.status === "APPROVED") ?? [],
    [outgoing.data],
  );

  const pendingGrants = useMemo(
    () => outgoing.data?.items.filter((p) => p.status === "REQUESTED") ?? [],
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
        "Access Request Sent",
        `Access request submitted for ${codeUpper}. The patient will receive a notification to grant access.`,
        [{ text: "OK" }],
      );
      setCode("");
      setNote("");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not send access request.";
      Alert.alert("Request Failed", msg);
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
          {/* Doctor Header */}
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>👨‍⚕️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcomeText}>Clinical Workspace</Text>
                <Text style={styles.docName}>{docName}</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Verified MD ✓</Text>
              </View>
            </View>
          </View>

          {/* Patient Lookup Card */}
          <View style={styles.lookupCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={{ fontSize: 18 }}>🔍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Patient Record Lookup</Text>
                <Text style={styles.cardSubtitle}>
                  Enter the patient&apos;s unique MediVault ID (e.g. MVK-2026-00003) to request clinical access.
                </Text>
              </View>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.inputLabel}>Patient ID</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="MVK-2026-XXXXX"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </View>

            <View style={{ marginTop: spacing.sm }}>
              <Text style={styles.inputLabel}>Clinical Reason (Optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Pre-consultation chart review / Clinical follow-up"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
                numberOfLines={2}
                editable={!submitting}
              />
            </View>

            <Pressable
              onPress={submitRequest}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && { opacity: 0.5 },
                pressed && canSubmit && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.submitBtnText}>Request Patient Access</Text>
              )}
            </Pressable>
          </View>

          {/* Pending Requests Notice */}
          {pendingGrants.length > 0 ? (
            <Pressable
              onPress={() => router.push("/(doctor)/requests")}
              style={({ pressed }) => [styles.pendingCard, pressed && { opacity: 0.9 }]}
            >
              <Text style={{ fontSize: 16 }}>⏳</Text>
              <Text style={styles.pendingText}>
                {pendingGrants.length} access {pendingGrants.length === 1 ? "request is" : "requests are"} waiting for
                patient approval.
              </Text>
              <Text style={styles.pendingLink}>View ›</Text>
            </Pressable>
          ) : null}

          {/* Active Patients Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Active Patients ({activeGrants.length})</Text>
            <Text style={styles.sectionSub}>Patients who have granted you chart access</Text>
          </View>

          {outgoing.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Loading authorized patients…</Text>
            </View>
          ) : activeGrants.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>📋</Text>
              <Text style={styles.emptyTitle}>No Active Patients</Text>
              <Text style={styles.emptySub}>
                Enter a Patient ID above to request access. Once the patient approves in their app, their chart will
                appear here.
              </Text>
            </View>
          ) : (
            activeGrants.map((g) => {
              const initials = g.patient.fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <Pressable
                  key={g.id}
                  onPress={() =>
                    router.push({
                      pathname: "/(doctor)/patient/[code]",
                      params: { code: g.patient.patientCode },
                    })
                  }
                  style={({ pressed }) => [styles.patientCard, pressed && styles.patientCardPressed]}
                >
                  <View style={styles.patientAvatar}>
                    <Text style={styles.patientAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{g.patient.fullName}</Text>
                    <Text style={styles.patientCode}>{g.patient.patientCode}</Text>
                    <Text style={styles.patientMeta}>
                      {g.expiresAt ? `Access active until ${formatDate(g.expiresAt)}` : "Permanent clinical access"}
                    </Text>
                  </View>
                  <View style={styles.openChartBtn}>
                    <Text style={styles.openChartBtnText}>Chart →</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22 },
  welcomeText: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  docName: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  verifiedBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  verifiedText: { fontSize: 11, fontWeight: "700", color: colors.successText },
  lookupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 4 },
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
  notesInput: { minHeight: 56, textAlignVertical: "top" },
  submitBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  submitBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pendingText: { flex: 1, fontSize: 12, color: colors.warningText, fontWeight: "600" },
  pendingLink: { fontSize: 13, color: colors.warningText, fontWeight: "700" },
  sectionHeaderRow: { marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  loadingBox: { padding: spacing.xl, alignItems: "center", gap: spacing.xs },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    ...shadows.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, paddingHorizontal: spacing.md },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  patientCardPressed: { backgroundColor: colors.backgroundAlt },
  patientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  patientAvatarText: { fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  patientName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  patientCode: { color: colors.primaryDark, fontSize: 12, marginTop: 2, fontWeight: "600" },
  patientMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  openChartBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  openChartBtnText: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 13 },
});
