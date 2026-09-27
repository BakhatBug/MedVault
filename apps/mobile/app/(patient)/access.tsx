import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../lib/api";
import {
  type AccessDurationChoice,
  type IncomingAccess,
  useApproveAccess,
  useDenyAccess,
  useIncomingAccess,
  useRevokeIncomingAccess,
} from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

const DURATION_LABEL: Record<AccessDurationChoice, string> = {
  HOURS_24: "24 Hours",
  DAYS_7: "7 Days",
  DAYS_30: "30 Days",
  PERMANENT: "Permanent Access",
};
const DURATIONS: AccessDurationChoice[] = ["HOURS_24", "DAYS_7", "DAYS_30", "PERMANENT"];

const STATUS_CONFIG: Record<IncomingAccess["status"], { bg: string; fg: string; label: string }> = {
  REQUESTED: { bg: colors.warningLight, fg: colors.warningText, label: "PENDING APPROVAL" },
  APPROVED: { bg: colors.successLight, fg: colors.successText, label: "ACTIVE GRANT" },
  DENIED: { bg: colors.dangerLight, fg: colors.dangerText, label: "DENIED" },
  EXPIRED: { bg: colors.backgroundAlt, fg: colors.textMuted, label: "EXPIRED" },
  REVOKED: { bg: colors.backgroundAlt, fg: colors.textMuted, label: "REVOKED" },
};

export default function AccessScreen() {
  const incoming = useIncomingAccess();
  const approve = useApproveAccess();
  const deny = useDenyAccess();
  const revoke = useRevokeIncomingAccess();

  const [selectedDuration, setSelectedDuration] = useState<Record<string, AccessDurationChoice>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onApprove(id: string) {
    const dur = selectedDuration[id] ?? "HOURS_24";
    setBusyId(id);
    try {
      await approve.mutateAsync({ id, duration: dur });
    } catch (e) {
      Alert.alert("Approval Failed", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function onDeny(id: string) {
    Alert.alert("Deny Request", "The doctor will not be granted access to your medical records.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deny",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await deny.mutateAsync(id);
          } catch (e) {
            Alert.alert("Denial Failed", e instanceof ApiError ? e.message : "Try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  function onRevoke(id: string) {
    Alert.alert("Revoke Doctor Access", "The doctor will immediately lose access to your vault records.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke Access",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await revoke.mutateAsync(id);
          } catch (e) {
            Alert.alert("Revoke Failed", e instanceof ApiError ? e.message : "Try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  const items = incoming.data?.items ?? [];
  const pending = items.filter((i) => i.status === "REQUESTED");
  const active = items.filter((i) => i.status === "APPROVED");
  const history = items.filter((i) => ["DENIED", "EXPIRED", "REVOKED"].includes(i.status));

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Doctor Access Permissions", headerBackTitle: "Back" }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={incoming.isFetching}
            onRefresh={() => void incoming.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Privacy Banner */}
        <View style={styles.privacyCard}>
          <Text style={{ fontSize: 24 }}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Zero-Trust Privacy Control</Text>
            <Text style={styles.privacySub}>
              Only physicians you explicitly approve can view your vault records. You can revoke access at any moment.
            </Text>
          </View>
        </View>

        {/* Pending Requests */}
        {pending.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Pending Requests ({pending.length})</Text>
            {pending.map((p) => {
              const currentDur = selectedDuration[p.id] ?? "HOURS_24";
              const isBusy = busyId === p.id;
              const docName = p.doctor.doctorProfile?.fullName || "Licensed Physician";

              return (
                <View key={p.id} style={styles.requestCard}>
                  <View style={styles.docHeader}>
                    <View style={styles.docAvatar}>
                      <Text style={{ fontSize: 18 }}>👨‍⚕️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName}>{docName}</Text>
                      {p.doctor.doctorProfile?.specialty ? (
                        <Text style={styles.docSpecialty}>{p.doctor.doctorProfile.specialty}</Text>
                      ) : null}
                    </View>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  </View>

                  {p.requestNote ? (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteLabel}>Doctor&apos;s reason:</Text>
                      <Text style={styles.noteText}>&quot;{p.requestNote}&quot;</Text>
                    </View>
                  ) : null}

                  {/* Duration Selector */}
                  <Text style={styles.durLabel}>Grant Access Duration:</Text>
                  <View style={styles.durationRow}>
                    {DURATIONS.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setSelectedDuration((prev) => ({ ...prev, [p.id]: d }))}
                        style={[styles.durChip, currentDur === d && styles.durChipActive]}
                      >
                        <Text style={[styles.durChipText, currentDur === d && styles.durChipTextActive]}>
                          {DURATION_LABEL[d]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => onApprove(p.id)}
                      disabled={isBusy}
                      style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.85 }]}
                    >
                      {isBusy ? (
                        <ActivityIndicator color={colors.primaryText} size="small" />
                      ) : (
                        <Text style={styles.approveBtnText}>Approve Access</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => onDeny(p.id)}
                      disabled={isBusy}
                      style={({ pressed }) => [styles.denyBtn, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.denyBtnText}>Deny</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Active Access Grants */}
        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.sectionTitle}>Active Doctor Access ({active.length})</Text>
          {active.length === 0 ? (
            <Text style={styles.muted}>No doctors currently have access to your vault.</Text>
          ) : (
            active.map((g) => {
              const docName = g.doctor.doctorProfile?.fullName || "Licensed Physician";
              const isBusy = busyId === g.id;

              return (
                <View key={g.id} style={styles.activeCard}>
                  <View style={styles.activeHeader}>
                    <View style={styles.docAvatarActive}>
                      <Text style={{ fontSize: 18 }}>👨‍⚕️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName}>{docName}</Text>
                      <Text style={styles.activeMeta}>
                        {g.expiresAt ? `Expires: ${formatDate(g.expiresAt)}` : "Permanent clinical access"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onRevoke(g.id)}
                      disabled={isBusy}
                      style={({ pressed }) => [styles.revokeBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={styles.revokeBtnText}>{isBusy ? "…" : "Revoke"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* History Log */}
        {history.length > 0 ? (
          <View style={{ marginTop: spacing.xxl }}>
            <Text style={styles.sectionTitle}>Past Permissions History</Text>
            {history.map((h) => {
              const statusCfg = STATUS_CONFIG[h.status] ?? STATUS_CONFIG.EXPIRED;
              return (
                <View key={h.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDoc}>{h.doctor.doctorProfile?.fullName || "Doctor"}</Text>
                    <Text style={styles.historyDate}>{new Date(h.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={[styles.historyBadge, { backgroundColor: statusCfg.bg }]}>
                    <Text style={[styles.historyBadgeText, { color: statusCfg.fg }]}>{statusCfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
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
  privacyCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    ...shadows.sm,
  },
  privacyTitle: { fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  privacySub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  docHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  docAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { fontSize: 16, fontWeight: "800", color: colors.text },
  docSpecialty: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  pendingBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: "700", color: colors.warningText },
  noteBox: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  noteLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  noteText: { fontSize: 13, color: colors.text, marginTop: 2, fontStyle: "italic" },
  durLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  durChip: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  durChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durChipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  durChipTextActive: { color: colors.primaryText },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  approveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  approveBtnText: { color: colors.primaryText, fontWeight: "800", fontSize: 14 },
  denyBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: "center",
  },
  denyBtnText: { color: colors.dangerText, fontWeight: "800", fontSize: 14 },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  activeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  docAvatarActive: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  activeMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  revokeBtn: {
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  revokeBtnText: { color: colors.dangerText, fontWeight: "700", fontSize: 12 },
  historyRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  historyDoc: { fontSize: 13, fontWeight: "700", color: colors.text },
  historyDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  historyBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  historyBadgeText: { fontSize: 10, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 13 },
});
