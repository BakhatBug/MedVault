import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RecordDetailModal } from "../../../components/RecordDetailModal";
import {
  type Medication,
  type RecordSummary,
  type TimelineEvent,
  useDoctorRecordDetail,
  useDoctorRecordViewUrl,
  usePatientForDoctor,
  usePatientInteractions,
  usePatientMedications,
  usePatientRecords,
  usePatientSummary,
  usePatientTimeline,
  useRefreshPatientSummary,
} from "../../../lib/queries";
import { colors, radius, spacing } from "../../../lib/theme";

const SEVERITY_STYLE: Record<string, { bg: string; fg: string }> = {
  major: { bg: "#FBEAEA", fg: "#B23A48" },
  moderate: { bg: "#FFF1DA", fg: "#A85800" },
  minor: { bg: "#E7F1E5", fg: "#1B7F4F" },
};

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "All Folders" },
  { key: "PRESCRIPTION", label: "Prescriptions" },
  { key: "LAB_RESULT", label: "Labs" },
  { key: "IMAGING", label: "Imaging" },
  { key: "DISCHARGE_SUMMARY", label: "Discharge" },
  { key: "CONSULTATION_NOTE", label: "Notes" },
  { key: "VACCINATION", label: "Vaccines" },
];

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: "Processing…", bg: "#FFF8E1", fg: "#B06000" },
  PROCESSING: { label: "Extracting AI…", bg: "#FFF8E1", fg: "#B06000" },
  COMPLETED: { label: "AI Extracted", bg: "#E6F4EA", fg: "#137333" },
  FAILED_RETRYABLE: { label: "Retrying AI", bg: "#FEEFC3", fg: "#B06000" },
  FAILED_PERMANENT: { label: "AI Unavailable", bg: "#F1F3F4", fg: "#5F6368" },
  UNAVAILABLE: { label: "AI Unavailable", bg: "#F1F3F4", fg: "#5F6368" },
};

export default function PatientDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code.toUpperCase() : null;

  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const profile = usePatientForDoctor(code);
  const records = usePatientRecords(code, selectedCategory === "ALL" ? undefined : selectedCategory);
  const meds = usePatientMedications(code);
  const interactions = usePatientInteractions(code);
  const summary = usePatientSummary(code);
  const refreshSummary = useRefreshPatientSummary(code);
  const timeline = usePatientTimeline(code);

  const recordDetail = useDoctorRecordDetail(code, selectedRecordId);
  const recordViewUrl = useDoctorRecordViewUrl(code, selectedRecordId);

  const onRefresh = () => {
    void profile.refetch();
    void records.refetch();
    void meds.refetch();
    void interactions.refetch();
    void summary.refetch();
    void timeline.refetch();
  };

  const summaryData = summary.data;
  const summaryContent = summaryData?.summaryText || summaryData?.summary;
  const interactionList =
    interactions.data && "interactions" in interactions.data ? interactions.data.interactions : [];

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: code ?? "Patient Chart", headerBackTitle: "Back" }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={profile.isFetching || records.isFetching || meds.isFetching || summary.isFetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Profile Card */}
        {profile.isLoading ? (
          <View style={styles.spinner}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : profile.error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{(profile.error as Error).message}</Text>
          </View>
        ) : profile.data ? (
          <View style={styles.profileCard}>
            <View style={styles.profileHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.patientName}>{profile.data.fullName}</Text>
                <Text style={styles.patientCode}>{profile.data.patientCode}</Text>
              </View>
              <View style={styles.accessBadge}>
                <Text style={styles.accessBadgeText}>Access Granted ✓</Text>
              </View>
            </View>

            <View style={styles.profileGrid}>
              <ProfileStat label="Age" value={formatAge(profile.data.dateOfBirth)} />
              <ProfileStat label="Blood" value={profile.data.bloodType ?? "—"} />
              <ProfileStat label="Sex" value={profile.data.gender ?? "—"} />
            </View>
          </View>
        ) : null}

        {/* AI Longitudinal Summary */}
        <View style={styles.aiSectionCard}>
          <View style={styles.sectionHead}>
            <View style={styles.aiBadgeTitle}>
              <Text style={styles.aiIcon}>✨</Text>
              <Text style={styles.aiCardTitle}>AI Longitudinal Clinical Summary</Text>
            </View>
            <Pressable
              onPress={() => void refreshSummary.mutateAsync()}
              disabled={refreshSummary.isPending || !code}
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.refreshText}>
                {refreshSummary.isPending ? "Generating…" : summaryData?.cached ? "🔄 Refresh AI" : "⚡ Generate AI"}
              </Text>
            </Pressable>
          </View>

          {summary.isLoading ? (
            <View style={styles.loadingAiRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Analyzing patient history with AI…</Text>
            </View>
          ) : summary.error ? (
            <Text style={styles.muted}>No summary generated yet. Tap &apos;Generate AI&apos; above.</Text>
          ) : summaryContent ? (
            <View style={styles.summaryBody}>
              <Text style={styles.summaryText}>{summaryContent}</Text>
              <Text style={styles.disclaimer}>{summaryData?.disclaimer}</Text>
            </View>
          ) : (
            <Text style={styles.muted}>Tap &apos;Generate AI&apos; to produce a synthesized clinical summary.</Text>
          )}

          {/* Ask AI button */}
          <Pressable
            onPress={() =>
              code && router.push({ pathname: "/(doctor)/patient/[code]/ask", params: { code } })
            }
            style={({ pressed }) => [styles.askButton, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.askButtonText}>💬 Ask AI Grounded Questions About Patient →</Text>
          </Pressable>
        </View>

        {/* Drug Interactions Alert */}
        {interactionList.length > 0 ? (
          <View style={styles.alertBlock}>
            <Text style={styles.alertHeader}>⚠️ AI Drug Interaction Warnings ({interactionList.length})</Text>
            {interactionList.map((i, idx) => {
              const palette = SEVERITY_STYLE[i.severity] ?? SEVERITY_STYLE["minor"]!;
              return (
                <View key={idx} style={[styles.interactionRow, { backgroundColor: palette.bg }]}>
                  <View style={styles.interactionHeader}>
                    <Text style={[styles.severity, { color: palette.fg }]}>{i.severity.toUpperCase()} SEVERITY</Text>
                    <Text style={styles.interactionMeds}>{i.medications.join(" + ")}</Text>
                  </View>
                  <Text style={styles.interactionDesc}>{i.description}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Medications */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Prescribed Medications</Text>
          {renderMedList(meds.data?.items.filter((m) => m.isActive) ?? [], "Active Medications")}
          {renderMedList(meds.data?.items.filter((m) => !m.isActive) ?? [], "Discontinued / History")}
        </View>

        {/* Categorized Records & Folders */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Medical Records & Folders</Text>
            <Text style={styles.recordCountText}>{records.data?.items.length ?? 0} files</Text>
          </View>

          {/* Folder tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map((c) => {
              const isSelected = selectedCategory === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setSelectedCategory(c.key)}
                  style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                >
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {records.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (records.data?.items.length ?? 0) === 0 ? (
            <Text style={styles.muted}>No documents found in this folder.</Text>
          ) : (
            records.data!.items.map((r) => {
              const status = STATUS_STYLE[r.aiStatus] ?? {
                label: r.aiStatus,
                bg: "#F1F3F4",
                fg: "#5F6368",
              };
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setSelectedRecordId(r.id)}
                  style={({ pressed }) => [styles.recordRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.recordRowHeader}>
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    <View style={[styles.badge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
                    </View>
                  </View>
                  <View style={styles.recordMetaRow}>
                    <Text style={styles.rowSub}>
                      📁 {r.category.replace(/_/g, " ").toLowerCase()} · 📅{" "}
                      {new Date(r.uploadedAt).toLocaleDateString()}
                    </Text>
                    <Text style={styles.inspectText}>Inspect AI Entities ›</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Timeline */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Chronological Patient Timeline</Text>
          {timeline.isLoading ? (
            <Text style={styles.muted}>Loading timeline…</Text>
          ) : (timeline.data?.items.length ?? 0) === 0 ? (
            <Text style={styles.muted}>No timeline events recorded.</Text>
          ) : (
            timeline.data!.items.slice(0, 20).map((e: TimelineEvent) => (
              <View key={e.id} style={styles.timelineRow}>
                <Text style={styles.timelineDate}>{e.occurredAt.slice(0, 10)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{e.title}</Text>
                  {e.description ? <Text style={styles.rowSub}>{e.description}</Text> : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Record detail modal */}
      <RecordDetailModal
        visible={!!selectedRecordId}
        onClose={() => setSelectedRecordId(null)}
        record={recordDetail.data ?? null}
        loading={recordDetail.isLoading}
        viewUrl={recordViewUrl.data?.url ?? null}
        loadingViewUrl={recordViewUrl.isLoading}
      />
    </SafeAreaView>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function renderMedList(items: Medication[], heading: string) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.subHead}>{heading}</Text>
      {items.map((m) => (
        <View key={m.id} style={styles.row}>
          <Text style={styles.rowTitle}>
            💊 {m.name}
            {m.dosage ? ` · ${m.dosage}` : ""}
          </Text>
          {m.frequency ? <Text style={styles.rowSub}>{m.frequency}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function formatAge(iso: string): string {
  const dob = new Date(iso);
  if (!Number.isFinite(dob.getTime())) return "—";
  const years = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return `${years}y`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  spinner: { padding: spacing.xl, alignItems: "center" },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  patientName: { fontSize: 22, fontWeight: "700", color: colors.text },
  patientCode: { color: colors.textMuted, fontSize: 12, marginTop: 2, letterSpacing: 0.5 },
  accessBadge: {
    backgroundColor: "#E6F4EA",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  accessBadgeText: { color: "#137333", fontSize: 11, fontWeight: "700" },
  profileGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  profileStat: { flex: 1, backgroundColor: colors.background, padding: spacing.md, borderRadius: radius.md },
  profileStatValue: { color: colors.text, fontSize: 18, fontWeight: "700" },
  profileStatLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  aiSectionCard: {
    backgroundColor: "#F4F7FB",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#D3E3FD",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  aiBadgeTitle: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  aiIcon: { fontSize: 18 },
  aiCardTitle: { fontSize: 16, fontWeight: "700", color: colors.primary },
  loadingAiRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  refreshBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#B7D2F5",
  },
  refreshText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  summaryBody: { marginTop: spacing.xs, marginBottom: spacing.md },
  summaryText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
  askButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  askButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  alertBlock: {
    backgroundColor: "#FFF4F4",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#F5C2C7",
  },
  alertHeader: { color: "#842029", fontWeight: "700", fontSize: 14, marginBottom: spacing.sm },
  interactionRow: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  interactionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  severity: { fontSize: 10, fontWeight: "700" },
  interactionMeds: { color: colors.text, fontWeight: "700", fontSize: 13 },
  interactionDesc: { color: colors.text, marginTop: spacing.xs, fontSize: 12 },
  sectionContainer: { marginTop: spacing.xs },
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  recordCountText: { color: colors.textMuted, fontSize: 12 },
  subHead: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  categoryScroll: { gap: spacing.sm, paddingVertical: spacing.sm },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  categoryTextActive: { color: colors.primaryText },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: "#F9FAFB" },
  recordRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  recordMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  inspectText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineDate: { color: colors.textMuted, fontSize: 11, fontWeight: "600", width: 76 },
  muted: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.xs },
  errorCard: { backgroundColor: "#FBEAEA", borderRadius: radius.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
});
