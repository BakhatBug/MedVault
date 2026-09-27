import { useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import { useIncomingAccess, useInteractions, useMedications, useRecords } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

export default function HomeScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const records = useRecords();
  const meds = useMedications();
  const interactions = useInteractions();
  const incoming = useIncomingAccess();

  const onRefresh = () => {
    void records.refetch();
    void meds.refetch();
    void interactions.refetch();
    void incoming.refetch();
  };

  const pendingRequests = incoming.data?.items.filter((i) => i.status === "REQUESTED") ?? [];

  const userName = state.status === "signed-in" ? state.user.fullName ?? "there" : "there";
  const patientCode = state.status === "signed-in" ? state.user.patientCode : null;

  const activeMedsCount = meds.data?.items.filter((m) => m.isActive).length ?? 0;
  const recordCount = records.data?.items.length ?? 0;
  const hasMajor =
    interactions.data && "interactions" in interactions.data
      ? interactions.data.interactions.some((i) => i.severity === "major")
      : false;

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={records.isFetching || meds.isFetching || interactions.isFetching}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.greeting}>Hello, {userName}.</Text>
      {patientCode ? <Text style={styles.code}>Patient ID · {patientCode}</Text> : null}

      {pendingRequests.length > 0 ? (
        <Pressable
          onPress={() => router.push("/(patient)/access")}
          style={({ pressed }) => [styles.pendingBanner, pressed && { opacity: 0.92 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>
              {pendingRequests.length === 1
                ? "A doctor is requesting access"
                : `${pendingRequests.length} doctors are requesting access`}
            </Text>
            <Text style={styles.pendingBody}>Tap to review and approve or deny.</Text>
          </View>
          <Text style={styles.pendingChevron}>›</Text>
        </Pressable>
      ) : null}

      <View style={styles.cards}>
        <StatCard label="Records" value={String(recordCount)} />
        <StatCard label="Active meds" value={String(activeMedsCount)} />
      </View>

      {hasMajor ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>Major drug interaction detected</Text>
          <Text style={styles.alertBody}>
            Open the Meds tab to review. AI-flagged; verify with your prescriber before any changes.
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent uploads</Text>
        <Pressable
          onPress={() => router.push("/(patient)/upload")}
          style={({ pressed }) => [styles.addInline, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.addInlineText}>+ Add</Text>
        </Pressable>
      </View>
      {records.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : records.error ? (
        <Text style={styles.error}>{(records.error as Error).message}</Text>
      ) : recordCount === 0 ? (
        <Text style={styles.muted}>No records yet — tap “+ Add” to capture or attach your first.</Text>
      ) : (
        records.data!.items.slice(0, 3).map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.rowSub}>
              {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()}
            </Text>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text },
  code: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 13 },
  cards: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 28, fontWeight: "700", color: colors.primary },
  statLabel: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 13 },
  alert: {
    marginTop: spacing.lg,
    backgroundColor: "#FBEAEA",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertTitle: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  alertBody: { color: colors.text, fontSize: 13, marginTop: spacing.xs },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  addInline: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  addInlineText: { color: colors.primaryText, fontWeight: "600", fontSize: 13 },
  pendingBanner: {
    marginTop: spacing.lg,
    backgroundColor: "#FFF1DA",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#E8B97A",
    flexDirection: "row",
    alignItems: "center",
  },
  pendingTitle: { color: "#A85800", fontWeight: "700", fontSize: 14 },
  pendingBody: { color: "#7A4500", fontSize: 12, marginTop: 2 },
  pendingChevron: { color: "#A85800", fontSize: 22, marginLeft: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
