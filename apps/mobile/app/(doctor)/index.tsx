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
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useOutgoingAccess, useRequestAccess, useSearchPatients } from "../../lib/queries";
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

  // Dynamic patient search
  const searchResults = useSearchPatients(code);

  const activeGrants = useMemo(
    () => outgoing.data?.items.filter((p) => p.status === "APPROVED") ?? [],
    [outgoing.data],
  );

  const pendingGrants = useMemo(
    () => outgoing.data?.items.filter((p) => p.status === "REQUESTED") ?? [],
    [outgoing.data],
  );

  const codeUpper = code.trim().toUpperCase();
  const canSubmit = codeUpper.length >= 2 && !submitting;

  async function submitRequest(targetCode?: string) {
    const codeToRequest = (targetCode ?? codeUpper).trim();
    if (!codeToRequest) return;
    setSubmitting(true);
    try {
      await request.mutateAsync({ patientCode: codeToRequest, ...(note.trim() ? { note: note.trim() } : {}) });
      Alert.alert(
        "Access Request Sent",
        `Access request submitted for ${codeToRequest}. The patient will receive a consent notification.`,
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
                <MaterialCommunityIcons name="doctor" size={24} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcomeText}>Clinical Workspace</Text>
                <Text style={styles.docName}>{docName}</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={13} color={colors.primaryDark} />
                <Text style={styles.verifiedText}>Verified MD</Text>
              </View>
            </View>
          </View>

          {/* Patient Lookup Card */}
          <View style={styles.lookupCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.searchIconBox}>
                <Ionicons name="search" size={18} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Patient Record Search & Lookup</Text>
                <Text style={styles.cardSubtitle}>
                  Search patient by Name (e.g. Ahmad) or Patient ID (e.g. MVK-2026-00003).
                </Text>
              </View>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.inputLabel}>Patient Name or ID</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Search patient name or MVK-2026-XXXXX…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </View>

            {/* Live Search Suggestions Dropdown */}
            {code.trim().length >= 1 ? (
              <View style={styles.searchDropdown}>
                {searchResults.isLoading ? (
                  <View style={styles.searchLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.searchLoadingText}>Searching patients…</Text>
                  </View>
                ) : (searchResults.data?.items.length ?? 0) === 0 ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.searchEmptyText}>No matching registered patients found.</Text>
                  </View>
                ) : (
                  searchResults.data!.items.map((pt) => (
                    <View key={pt.patientCode} style={styles.searchResultRow}>
                      <View style={styles.patientAvatarSmall}>
                        <Ionicons name="person-outline" size={16} color={colors.primaryDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultName}>{pt.fullName}</Text>
                        <Text style={styles.searchResultCode}>{pt.patientCode}</Text>
                      </View>

                      {pt.hasActiveAccess ? (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/(doctor)/patient/[code]",
                              params: { code: pt.patientCode },
                            })
                          }
                          style={styles.openChartSmallBtn}
                        >
                          <Text style={styles.openChartSmallText}>Open Chart</Text>
                          <Feather name="chevron-right" size={12} color={colors.primaryDark} />
                        </Pressable>
                      ) : pt.hasPendingAccess ? (
                        <View style={styles.pendingBadgeSmall}>
                          <Text style={styles.pendingBadgeText}>Pending Consent</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => submitRequest(pt.patientCode)}
                          disabled={submitting}
                          style={({ pressed }) => [
                            styles.requestAccessSmallBtn,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.requestAccessSmallText}>Request Access</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}
              </View>
            ) : null}

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

            {PATIENT_CODE_REGEX.test(codeUpper) ? (
              <Pressable
                onPress={() => submitRequest()}
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
                  <Text style={styles.submitBtnText}>Request Access for {codeUpper}</Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {/* Pending Requests Notice */}
          {pendingGrants.length > 0 ? (
            <Pressable
              onPress={() => router.push("/(doctor)/requests")}
              style={({ pressed }) => [styles.pendingCard, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="time-outline" size={18} color={colors.warningText} />
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
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Active Patients</Text>
              <Text style={styles.emptySub}>
                Enter a Patient ID above to request access. Once the patient approves in their app, their chart will
                appear here.
              </Text>
            </View>
          ) : (
            activeGrants.map((grant) => (
              <Pressable
                key={grant.id}
                onPress={() =>
                  router.push({
                    pathname: "/(doctor)/patient/[code]",
                    params: { code: grant.patient?.patientCode ?? "" },
                  })
                }
                style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.patientAvatarCircle}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{grant.patient?.fullName ?? "Anonymous Patient"}</Text>
                  <Text style={styles.patientCode}>{grant.patient?.patientCode}</Text>
                  <Text style={styles.patientMeta}>
                    Granted {new Date(grant.createdAt).toLocaleDateString()}
                    {grant.expiresAt ? ` · Expires ${new Date(grant.expiresAt).toLocaleDateString()}` : " · Indefinite"}
                  </Text>
                </View>
                <View style={styles.openChartBtn}>
                  <Text style={styles.openChartText}>Open Chart</Text>
                  <Feather name="chevron-right" size={14} color={colors.primaryDark} />
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeText: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  docName: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  verifiedText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  lookupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  searchIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  submitBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadows.sm,
  },
  submitBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pendingText: { flex: 1, fontSize: 12, color: colors.warningText, fontWeight: "600" },
  pendingLink: { fontSize: 12, fontWeight: "700", color: colors.warningText },
  sectionHeaderRow: { marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  loadingBox: { padding: spacing.xl, alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 13 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 4, lineHeight: 17 },
  patientCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.sm,
  },
  patientAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  patientName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  patientCode: { color: colors.primaryDark, fontSize: 12, marginTop: 2, fontWeight: "600" },
  patientMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  searchDropdown: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  searchLoadingText: { fontSize: 12, color: colors.textMuted },
  searchEmpty: { padding: spacing.md, alignItems: "center" },
  searchEmptyText: { fontSize: 12, color: colors.textMuted },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: 4,
    gap: spacing.sm,
  },
  patientAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultName: { fontSize: 14, fontWeight: "700", color: colors.text },
  searchResultCode: { fontSize: 11, color: colors.primaryDark, fontWeight: "600", marginTop: 1 },
  openChartSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  openChartSmallText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  pendingBadgeSmall: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: "700", color: colors.warningText },
  requestAccessSmallBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  requestAccessSmallText: { fontSize: 11, fontWeight: "700", color: colors.primaryText },
  openChartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  openChartText: { color: colors.primaryDark, fontWeight: "700", fontSize: 12 },
});
