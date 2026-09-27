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
import { colors, radius, shadows, spacing } from "../../../lib/theme";

const SEVERITY_CONFIG: Record<string, { bg: string; fg: string; border: string }> = {
  major: { bg: colors.dangerLight, fg: colors.dangerText, border: colors.dangerBorder },
  moderate: { bg: colors.warningLight, fg: colors.warningText, border: colors.warningBorder },
  minor: { bg: colors.successLight, fg: colors.successText, border: colors.successBorder },
};

const CATEGORIES: Array<{ key: string; label: string; icon: string }> = [
  { key: "ALL", label: "All Folders", icon: "📁" },
  { key: "PRESCRIPTION", label: "Prescriptions", icon: "💊" },
  { key: "LAB_RESULT", label: "Labs & Tests", icon: "🧪" },
  { key: "IMAGING", label: "Imaging & Scans", icon: "🩻" },
  { key: "DISCHARGE_SUMMARY", label: "Discharge", icon: "📋" },
  { key: "CONSULTATION_NOTE", label: "Doctor Notes", icon: "📝" },
  { key: "VACCINATION", label: "Vaccines", icon: "💉" },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  PENDING: { label: "Processing…", bg: colors.warningLight, fg: colors.warningText, dot: "#F59E0B" },
  PROCESSING: { label: "Extracting AI…", bg: colors.aiLight, fg: colors.aiDark, dot: "#6366F1" },
  COMPLETED: { label: "AI Extracted", bg: colors.successLight, fg: colors.successText, dot: "#10B981" },
  FAILED_RETRYABLE: { label: "Retrying AI", bg: colors.warningLight, fg: colors.warningText, dot: "#F59E0B" },
  FAILED_PERMANENT: { label: "AI Unavailable", bg: colors.backgroundAlt, fg: colors.textMuted, dot: "#94A3B8" },
  UNAVAILABLE: { label: "AI Unavailable", bg: colors.backgroundAlt, fg: colors.textMuted, dot: "#94A3B8" },
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
      <Stack.Screen options={{ title: code ?? "Clinical Chart", headerBackTitle: "Back" }} />
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
        {/* Profile Telemetry Header */}
        {profile.isLoading ? (
          <View style={styles.spinner}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : profile.error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{(profile.error as Error).message}</Text>
          </View>
        ) : profile.data ? (
          <View style={styles.profileCard}>
            <View style={styles.profileHeaderRow}>
              <View style={styles.patientAvatarBox}>
                <Text style={styles.avatarInitials}>
                  {profile.data.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
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
              <ProfileStat label="Blood Group" value={profile.data.bloodType ?? "—"} />
              <ProfileStat label="Gender" value={profile.data.gender ?? "—"} />
              <ProfileStat
                label="Weight"
                value={profile.data.weightKg ? `${profile.data.weightKg} kg` : "—"}
              />
            </View>
          </View>
        ) : null}

        {/* AI Longitudinal Summary */}
        <View style={styles.aiSectionCard}>
          <View style={styles.sectionHead}>
            <View style={styles.aiBadgeTitle}>
              <Text style={{ fontSize: 20 }}>✨</Text>
              <View>
                <Text style={styles.aiCardTitle}>AI Longitudinal Clinical Summary</Text>
                <Text style={styles.aiCardSub}>Synthesized across entire medical vault history</Text>
              </View>
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
              <ActivityIndicator color={colors.ai} />
              <Text style={styles.aiLoadingText}>Synthesizing clinical timeline & diagnostic records…</Text>
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

          {/* Ask AI CTA Button */}
          <Pressable
            onPress={() =>
              code && router.push({ pathname: "/(doctor)/patient/[code]/ask", params: { code } })
            }
            style={({ pressed }) => [styles.askButton, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.askButtonText}>💬 Ask AI Assistant About This Patient →</Text>
          </Pressable>
        </View>

        {/* Drug Interactions Alert */}
        {interactionList.length > 0 ? (
          <View style={styles.alertBlock}>
            <View style={styles.alertHeaderRow}>
              <Text style={{ fontSize: 18 }}>⚠️</Text>
              <Text style={styles.alertHeader}>Drug Interaction Alerts ({interactionList.length})</Text>
            </View>
            {interactionList.map((i, idx) => {
              const palette = SEVERITY_CONFIG[i.severity] ?? SEVERITY_CONFIG["minor"]!;
              return (
                <View
                  key={idx}
                  style={[
                    styles.interactionRow,
                    { backgroundColor: palette.bg, borderColor: palette.border },
                  ]}
                >
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
            <Text style={styles.recordCountText}>{records.data?.items.length ?? 0} documents</Text>
          </View>

          {/* Category Folders Scroll */}
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
                  <Text style={{ fontSize: 13, marginRight: 4 }}>{c.icon}</Text>
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
              const status = STATUS_CONFIG[r.aiStatus] ?? {
                label: r.aiStatus,
                bg: colors.backgroundAlt,
                fg: colors.textMuted,
                dot: "#94A3B8",
              };
              const catIcon =
                r.category === "PRESCRIPTION"
                  ? "💊"
                  : r.category === "LAB_RESULT"
                  ? "🧪"
                  : r.category === "IMAGING"
                  ? "🩻"
                  : r.category === "DISCHARGE_SUMMARY"
                  ? "📋"
                  : "📄";

              return (
                <Pressable
                  key={r.id}
                  onPress={() => setSelectedRecordId(r.id)}
                  style={({ pressed }) => [styles.recordRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.recordRowHeader}>
                    <View style={styles.docIconBox}>
                      <Text style={{ fontSize: 18 }}>{catIcon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.title}</Text>
                      <Text style={styles.rowSub}>
                        {r.category.replace(/_/g, " ").toLowerCase()} · 📅{" "}
                        {new Date(r.uploadedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: status.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                      <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
                    </View>
                  </View>
                  <View style={styles.recordMetaRow}>
                    <Text style={styles.inspectHint}>Extracted into structured FHIR resources</Text>
                    <Text style={styles.inspectText}>Inspect AI Data →</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Chronological Timeline */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Chronological Patient Timeline</Text>
          {timeline.isLoading ? (
            <Text style={styles.muted}>Loading timeline…</Text>
          ) : (timeline.data?.items.length ?? 0) === 0 ? (
            <Text style={styles.muted}>No timeline events recorded.</Text>
          ) : (
            timeline.data!.items.slice(0, 20).map((e: TimelineEvent) => (
              <View key={e.id} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineDate}>{e.occurredAt.slice(0, 10)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineTitle}>{e.title}</Text>
                  {e.description ? <Text style={styles.timelineSub}>{e.description}</Text> : null}
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
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.subHead}>{heading}</Text>
      {items.map((m) => (
        <View key={m.id} style={styles.medCard}>
          <View style={styles.medIconBox}>
            <Text style={{ fontSize: 16 }}>💊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.medTitle}>
              {m.name}
              {m.dosage ? ` · ${m.dosage}` : ""}
            </Text>
            {m.frequency ? <Text style={styles.medSub}>{m.frequency}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function formatAge(iso: string): string {
  const dob = new Date(iso);
  if (!Number.isFinite(dob.getTime())) return "—";
  const years = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return `${years} yrs`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  spinner: { padding: spacing.xxl, alignItems: "center" },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  profileHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  patientAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  avatarInitials: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
  patientName: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  patientCode: { color: colors.primaryDark, fontSize: 12, marginTop: 2, fontWeight: "700" },
  accessBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  accessBadgeText: { color: colors.successText, fontSize: 11, fontWeight: "700" },
  profileGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  profileStat: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  profileStatValue: { color: colors.text, fontSize: 17, fontWeight: "800" },
  profileStatLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "600" },
  aiSectionCard: {
    backgroundColor: colors.aiLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    ...shadows.sm,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  aiBadgeTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  aiCardTitle: { fontSize: 15, fontWeight: "800", color: colors.aiDark },
  aiCardSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  loadingAiRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  aiLoadingText: { color: colors.aiDark, fontSize: 13, fontWeight: "600" },
  refreshBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.aiBorder,
  },
  refreshText: { color: colors.aiDark, fontWeight: "700", fontSize: 12 },
  summaryBody: { marginTop: spacing.xs, marginBottom: spacing.md },
  summaryText: { color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: "400" },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
  askButton: {
    backgroundColor: colors.ai,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  askButtonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  alertBlock: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  alertHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  alertHeader: { color: colors.dangerText, fontWeight: "800", fontSize: 14 },
  interactionRow: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
  },
  interactionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  severity: { fontSize: 10, fontWeight: "800" },
  interactionMeds: { color: colors.text, fontWeight: "700", fontSize: 13 },
  interactionDesc: { color: colors.textSecondary, marginTop: 4, fontSize: 12, lineHeight: 16 },
  sectionContainer: { marginTop: spacing.xs },
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: -0.3,
  },
  recordCountText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  subHead: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  medCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  medIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  medTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  medSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  categoryScroll: { gap: spacing.xs, paddingVertical: spacing.sm },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
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
  categoryTextActive: { color: colors.primaryText, fontWeight: "700" },
  recordRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rowPressed: { backgroundColor: colors.backgroundAlt },
  recordRowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  recordMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  inspectHint: { fontSize: 11, color: colors.textMuted },
  inspectText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  timelineDate: { color: colors.textMuted, fontSize: 12, fontWeight: "700", width: 80 },
  timelineTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  timelineSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.xs },
  errorCard: { backgroundColor: colors.dangerLight, borderRadius: radius.lg, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
});
