import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RecordDetailModal } from "../../../components/RecordDetailModal";
import { useCaregiverPatientRecords, useRecordDetail, useRecordViewUrl } from "../../../lib/queries";
import { colors, radius, shadows, spacing } from "../../../lib/theme";

const CATEGORY_ICONS: Record<string, string> = {
  PRESCRIPTION: "💊",
  LAB_RESULT: "🧪",
  IMAGING: "🩻",
  DISCHARGE_SUMMARY: "📋",
  CONSULTATION_NOTE: "📝",
  VACCINATION: "💉",
  INSURANCE: "🛡️",
  OTHER: "📄",
};

const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  COMPLETED: { label: "AI Extracted", bg: "#DCFCE7", fg: "#15803D" },
  PROCESSING: { label: "Processing…", bg: "#FEF3C7", fg: "#B45309" },
  PENDING: { label: "Queued", bg: "#F1F5F9", fg: "#64748B" },
  FAILED_RETRYABLE: { label: "Retrying", bg: "#FEE2E2", fg: "#B91C1C" },
  FAILED_PERMANENT: { label: "Failed", bg: "#FEE2E2", fg: "#B91C1C" },
  UNAVAILABLE: { label: "Unavailable", bg: "#F1F5F9", fg: "#64748B" },
};

export default function CaregiverPatientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code.toUpperCase() : null;
  const records = useCaregiverPatientRecords(code);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const recordDetail = useRecordDetail(selectedRecordId);
  const recordViewUrl = useRecordViewUrl(selectedRecordId);

  const items = records.data?.items ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen
        options={{
          title: code ? `Vault: ${code}` : "Patient Vault",
          headerBackTitle: "Patients",
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontWeight: "800", fontSize: 16 },
        }}
      />
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
        {/* Header Hero Banner */}
        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Patient Records</Text>
            <Text style={styles.heroSub}>
              Authorized proxy access to diagnostic files & clinical extractions for {code}.
            </Text>
          </View>
          <Pressable
            onPress={() =>
              code && router.push({ pathname: "/(caregiver)/patient/[code]/upload", params: { code } })
            }
            style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.uploadBtnText}>+ Upload</Text>
          </Pressable>
        </View>

        {/* Records List */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>DOCUMENTS ({items.length})</Text>
        </View>

        {records.isLoading ? (
          <View style={styles.loadingBox}>
            <Text style={styles.muted}>Loading patient records…</Text>
          </View>
        ) : records.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{(records.error as Error).message}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={styles.emptyTitle}>No Records Found</Text>
            <Text style={styles.emptySub}>
              No health documents uploaded yet for this patient. Tap &quot;+ Upload&quot; to add prescriptions, labs, or
              imaging.
            </Text>
          </View>
        ) : (
          items.map((r) => {
            const icon = CATEGORY_ICONS[r.category] ?? "📄";
            const status = STATUS_PILL[r.aiStatus] ?? STATUS_PILL.PENDING ?? { label: r.aiStatus, bg: "#F1F5F9", fg: "#64748B" };

            return (
              <Pressable
                key={r.id}
                onPress={() => setSelectedRecordId(r.id)}
                style={({ pressed }) => [styles.recordCard, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.recordIconBox}>
                  <Text style={styles.recordIcon}>{icon}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.recordTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.recordMeta}>
                    {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()}
                  </Text>
                </View>

                <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusPillText, { color: status.fg }]}>{status.label}</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Record Inspection Modal */}
      {selectedRecordId ? (
        <RecordDetailModal
          record={recordDetail.data ?? null}
          loading={recordDetail.isLoading}
          viewUrl={recordViewUrl.data?.url ?? null}
          loadingViewUrl={recordViewUrl.isLoading}
          visible={!!selectedRecordId}
          onClose={() => setSelectedRecordId(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadows.sm,
    gap: spacing.md,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  heroSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  uploadBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  uploadBtnText: {
    color: colors.primaryText,
    fontWeight: "700",
    fontSize: 13,
  },
  listHeader: {
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  listHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  recordCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    gap: spacing.md,
  },
  recordIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  recordIcon: {
    fontSize: 22,
  },
  recordTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18,
  },
  recordMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  loadingBox: {
    padding: spacing.xl,
    alignItems: "center",
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

