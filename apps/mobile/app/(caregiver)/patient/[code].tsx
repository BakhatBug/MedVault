import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCaregiverPatientRecords } from "../../../lib/queries";
import { colors, radius, spacing } from "../../../lib/theme";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Processing…",
  PROCESSING: "Processing…",
  COMPLETED: "AI extracted",
  FAILED_RETRYABLE: "Retrying AI",
  FAILED_PERMANENT: "AI unavailable",
  UNAVAILABLE: "AI unavailable",
};

// Caregiver's view of a linked patient: their records, plus the ability to
// upload a document on the patient's behalf.
export default function CaregiverPatientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code.toUpperCase() : null;
  const records = useCaregiverPatientRecords(code);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: code ?? "Patient", headerBackTitle: "Patients" }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={records.isFetching}
            onRefresh={() => void records.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Records</Text>
          <Pressable
            onPress={() =>
              code && router.push({ pathname: "/(caregiver)/patient/[code]/upload", params: { code } })
            }
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Documents in this patient&apos;s vault. You can upload on their behalf.</Text>

        {records.isLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : records.error ? (
          <Text style={styles.error}>{(records.error as Error).message}</Text>
        ) : (records.data?.items.length ?? 0) === 0 ? (
          <Text style={styles.muted}>No records yet. Tap &quot;+ Add&quot; to upload the first one.</Text>
        ) : (
          records.data!.items.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={styles.badge}>{STATUS_LABEL[r.aiStatus] ?? r.aiStatus}</Text>
              </View>
              <Text style={styles.rowSub}>
                {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  addButtonText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg, fontSize: 13 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 14, flex: 1 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    backgroundColor: "#E1ECF1",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
