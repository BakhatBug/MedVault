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
import { colors, radius, spacing } from "../../lib/theme";

// Patient-facing access management. Three flavors of row:
//  - REQUESTED  → Approve (chip pick) / Deny
//  - APPROVED   → Revoke
//  - DENIED/EXPIRED/REVOKED → read-only history

const DURATION_LABEL: Record<AccessDurationChoice, string> = {
  HOURS_24: "24 hours",
  DAYS_7: "7 days",
  DAYS_30: "30 days",
  PERMANENT: "Permanent",
};
const DURATIONS: AccessDurationChoice[] = ["HOURS_24", "DAYS_7", "DAYS_30", "PERMANENT"];

const STATUS_STYLE: Record<IncomingAccess["status"], { bg: string; fg: string; label: string }> = {
  REQUESTED: { bg: "#FFF1DA", fg: "#A85800", label: "PENDING" },
  APPROVED: { bg: "#E7F1E5", fg: "#1B7F4F", label: "ACTIVE" },
  DENIED: { bg: "#FBEAEA", fg: "#B23A48", label: "DENIED" },
  EXPIRED: { bg: "#E1E8ED", fg: "#5B6C7A", label: "EXPIRED" },
  REVOKED: { bg: "#E1E8ED", fg: "#5B6C7A", label: "REVOKED" },
};

export default function AccessScreen() {
  const incoming = useIncomingAccess();
  const approve = useApproveAccess();
  const deny = useDenyAccess();
  const revoke = useRevokeIncomingAccess();

  // Tracks which row has expanded duration chips. Only one open at a time.
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onApprove(id: string, duration: AccessDurationChoice) {
    setBusyId(id);
    try {
      await approve.mutateAsync({ id, duration });
      setPickingFor(null);
    } catch (e) {
      Alert.alert("Could not approve", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function onDeny(id: string) {
    Alert.alert("Deny request?", "The doctor will be notified and cannot retry without your invitation.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deny",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await deny.mutateAsync(id);
          } catch (e) {
            Alert.alert("Could not deny", e instanceof ApiError ? e.message : "Try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  function onRevoke(id: string) {
    Alert.alert("Revoke access?", "The doctor will lose access immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await revoke.mutateAsync(id);
          } catch (e) {
            Alert.alert("Could not revoke", e instanceof ApiError ? e.message : "Try again.");
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
  const history = items.filter((i) => !["REQUESTED", "APPROVED"].includes(i.status));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Doctor access" }} />
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
        {pending.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Pending requests</Text>
            {pending.map((p) => (
              <View key={p.id} style={styles.card}>
                <Row item={p} />
                {p.requestNote ? <Text style={styles.note}>“{p.requestNote}”</Text> : null}
                {pickingFor === p.id ? (
                  <View style={styles.chips}>
                    {DURATIONS.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => void onApprove(p.id, d)}
                        disabled={busyId === p.id}
                        style={({ pressed }) => [
                          styles.chip,
                          pressed && busyId !== p.id && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={styles.chipText}>{DURATION_LABEL[d]}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.buttonRow}>
                  {pickingFor === p.id ? (
                    <Pressable
                      onPress={() => setPickingFor(null)}
                      style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onDeny(p.id)}
                        disabled={busyId === p.id}
                        style={({ pressed }) => [styles.denyButton, pressed && { opacity: 0.85 }]}
                      >
                        <Text style={styles.denyText}>Deny</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPickingFor(p.id)}
                        disabled={busyId === p.id}
                        style={({ pressed }) => [styles.approveButton, pressed && { opacity: 0.85 }]}
                      >
                        {busyId === p.id ? (
                          <ActivityIndicator color={colors.primaryText} />
                        ) : (
                          <Text style={styles.approveText}>Approve</Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {active.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Active access</Text>
            {active.map((a) => (
              <View key={a.id} style={styles.card}>
                <Row item={a} />
                <Text style={styles.meta}>
                  Granted {formatRelative(a.approvedAt)}
                  {a.expiresAt ? ` · expires ${formatRelative(a.expiresAt)}` : " · permanent"}
                </Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    onPress={() => onRevoke(a.id)}
                    disabled={busyId === a.id}
                    style={({ pressed }) => [styles.denyButton, pressed && { opacity: 0.85 }]}
                  >
                    {busyId === a.id ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : (
                      <Text style={styles.denyText}>Revoke</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {history.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>History</Text>
            {history.map((h) => (
              <View key={h.id} style={[styles.card, { opacity: 0.7 }]}>
                <Row item={h} />
              </View>
            ))}
          </>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No doctor access requests yet.</Text>
            <Text style={styles.emptyHint}>
              When a verified doctor scans your Patient ID, you&apos;ll be asked here whether to grant access.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ item }: { item: IncomingAccess }) {
  const palette = STATUS_STYLE[item.status];
  const name = item.doctor.doctorProfile?.fullName ?? "Unknown doctor";
  const specialty = item.doctor.doctorProfile?.specialty;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.doctorName}>Dr. {name}</Text>
        {specialty ? <Text style={styles.subtle}>{specialty}</Text> : null}
        <Text style={styles.subtle}>Requested {formatRelative(item.createdAt)}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: palette.bg }]}>
        <Text style={[styles.pillText, { color: palette.fg }]}>{palette.label}</Text>
      </View>
    </View>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  if (abs < 60_000) return future ? "in a moment" : "just now";
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.round(abs / 3_600_000);
  if (hrs < 48) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(abs / 86_400_000);
  return future ? `in ${days}d` : `${days}d ago`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  doctorName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  subtle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  note: {
    marginTop: spacing.sm,
    color: colors.text,
    fontStyle: "italic",
    fontSize: 13,
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  chipText: { color: colors.primaryText, fontWeight: "600", fontSize: 13 },
  buttonRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm, justifyContent: "flex-end" },
  approveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    minWidth: 100,
    alignItems: "center",
  },
  approveText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  denyButton: {
    backgroundColor: "#FBEAEA",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F0CCD0",
    minWidth: 80,
    alignItems: "center",
  },
  denyText: { color: colors.danger, fontWeight: "600", fontSize: 14 },
  ghostButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  ghostText: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  emptyHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: "center" },
});
