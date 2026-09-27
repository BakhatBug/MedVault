import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../lib/auth-context";
import {
  useIncomingAccess,
  useInteractions,
  useMedications,
  useRecords,
  useTimeline,
} from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function HomeScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const records = useRecords();
  const meds = useMedications();
  const interactions = useInteractions();
  const incoming = useIncomingAccess();
  const timeline = useTimeline();

  const onRefresh = () => {
    void records.refetch();
    void meds.refetch();
    void interactions.refetch();
    void incoming.refetch();
    void timeline.refetch();
  };

  const pendingRequests = useMemo(
    () => incoming.data?.items.filter((i) => i.status === "REQUESTED") ?? [],
    [incoming.data],
  );

  const approvedDoctors = useMemo(
    () => incoming.data?.items.filter((i) => i.status === "APPROVED") ?? [],
    [incoming.data],
  );

  const userName = state.status === "signed-in" ? state.user.fullName ?? "Patient" : "Patient";
  const userInitial = userName.charAt(0).toUpperCase();
  const patientCode = state.status === "signed-in" ? state.user.patientCode : null;

  const activeMedsCount = meds.data?.items.filter((m) => m.isActive).length ?? 0;
  const recordCount = records.data?.items.length ?? 0;
  const timelineCount = timeline.data?.items.length ?? 0;
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
      {/* Hero Welcome Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{userInitial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeSubtitle}>Welcome back</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <View style={styles.vaultShieldBadge}>
            <Text style={styles.shieldIcon}>🔒</Text>
            <Text style={styles.vaultShieldText}>Vault Active</Text>
          </View>
        </View>

        {patientCode ? (
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Patient ID</Text>
            <Text style={styles.codeValue}>{patientCode}</Text>
          </View>
        ) : null}
      </View>

      {/* Pending Doctor Access Request Alert */}
      {pendingRequests.length > 0 ? (
        <Pressable
          onPress={() => router.push("/(patient)/access")}
          style={({ pressed }) => [styles.pendingBanner, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.pendingIconBox}>
            <Text style={{ fontSize: 20 }}>👨‍⚕️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>
              {pendingRequests.length === 1
                ? "Doctor Access Requested"
                : `${pendingRequests.length} Doctors Requesting Access`}
            </Text>
            <Text style={styles.pendingBody}>
              {pendingRequests[0]?.doctor?.doctorProfile?.fullName || "A licensed physician"} requested access to your
              records.
            </Text>
          </View>
          <View style={styles.reviewPill}>
            <Text style={styles.reviewPillText}>Review ›</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Quick Action Grid */}
      <View style={styles.quickActionRow}>
        <QuickActionItem
          icon="📤"
          label="Upload"
          sub="Add record"
          onPress={() => router.push("/(patient)/upload")}
        />
        <QuickActionItem
          icon="💊"
          label="Meds"
          sub="Prescriptions"
          onPress={() => router.push("/(patient)/medications")}
        />
        <QuickActionItem
          icon="🪪"
          label="Emergency"
          sub="Public QR"
          onPress={() => router.push("/(patient)/emergency")}
        />
        <QuickActionItem
          icon="🤝"
          label="Doctors"
          sub={`${approvedDoctors.length} active`}
          onPress={() => router.push("/(patient)/access")}
        />
      </View>

      {/* Stats Summary Grid */}
      <View style={styles.statsGrid}>
        <MetricCard
          icon="📁"
          label="Medical Records"
          value={String(recordCount)}
          caption="Documents in vault"
          onPress={() => router.push("/(patient)/records")}
        />
        <MetricCard
          icon="💊"
          label="Active Meds"
          value={String(activeMedsCount)}
          caption="Currently taking"
          onPress={() => router.push("/(patient)/medications")}
        />
        <MetricCard
          icon="⏱️"
          label="Health Events"
          value={String(timelineCount)}
          caption="Timeline records"
          onPress={() => router.push("/(patient)/timeline")}
        />
      </View>

      {/* Drug Interaction Alert */}
      {hasMajor ? (
        <Pressable
          onPress={() => router.push("/(patient)/medications")}
          style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.alertHeader}>
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text style={styles.alertTitle}>Major Drug Interaction Warning</Text>
          </View>
          <Text style={styles.alertBody}>
            The AI detected a potential conflict between active medications. Tap to review details with your doctor.
          </Text>
        </Pressable>
      ) : null}

      {/* AI Clinical Assistant Feature Banner */}
      <View style={styles.aiInsightCard}>
        <View style={styles.aiHeader}>
          <Text style={{ fontSize: 20 }}>✨</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiTitle}>AI Clinical Engine Active</Text>
            <Text style={styles.aiSub}>
              Uploaded tests & prescriptions are automatically converted into structured FHIR records for your doctors.
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Uploads Section */}
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.sectionHeading}>Recent Documents</Text>
          <Text style={styles.sectionSubHeading}>Latest files in your encrypted vault</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(patient)/records")}
          style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.viewAllText}>View All →</Text>
        </Pressable>
      </View>

      {records.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading vault documents…</Text>
        </View>
      ) : records.error ? (
        <Text style={styles.errorText}>{(records.error as Error).message}</Text>
      ) : recordCount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={{ fontSize: 36, marginBottom: spacing.xs }}>📄</Text>
          <Text style={styles.emptyTitle}>Your Vault is Empty</Text>
          <Text style={styles.emptyBody}>Upload your first prescription, lab report, or scan to get started.</Text>
          <Pressable
            onPress={() => router.push("/(patient)/upload")}
            style={({ pressed }) => [styles.uploadFirstBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.uploadFirstBtnText}>+ Upload Medical Record</Text>
          </Pressable>
        </View>
      ) : (
        records.data!.items.slice(0, 3).map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push("/(patient)/records")}
            style={({ pressed }) => [styles.recordRow, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.recordIconBox}>
              <Text style={{ fontSize: 18 }}>
                {r.category === "PRESCRIPTION"
                  ? "💊"
                  : r.category === "LAB_RESULT"
                  ? "🧪"
                  : r.category === "IMAGING"
                  ? "🩻"
                  : "📄"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recordTitle} numberOfLines={1}>
                {r.title}
              </Text>
              <Text style={styles.recordSub}>
                {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.aiStatusBadge}>
              <Text style={styles.aiStatusText}>
                {r.aiStatus === "COMPLETED" ? "Extracted ✓" : "Processing…"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

function QuickActionItem({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickActionBtn, pressed && styles.quickActionBtnPressed]}
    >
      <View style={styles.quickActionIconBox}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
      <Text style={styles.quickActionSub}>{sub}</Text>
    </Pressable>
  );
}

function MetricCard({
  icon,
  label,
  value,
  caption,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.metricCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.metricHeader}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricCaption}>{caption}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primaryText,
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  vaultShieldBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    gap: 4,
  },
  shieldIcon: { fontSize: 11 },
  vaultShieldText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  codeContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  codeLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  codeValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  pendingBanner: {
    marginTop: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pendingIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTitle: { color: colors.warningText, fontWeight: "700", fontSize: 14 },
  pendingBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  reviewPill: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  reviewPillText: { color: colors.surface, fontWeight: "700", fontSize: 12 },
  quickActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  quickActionBtnPressed: {
    backgroundColor: colors.backgroundAlt,
  },
  quickActionIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  quickActionLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  quickActionSub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  metricLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  metricValue: { fontSize: 24, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  metricCaption: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  alertCard: {
    marginTop: spacing.md,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  alertHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  alertTitle: { color: colors.dangerText, fontWeight: "700", fontSize: 14 },
  alertBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  aiInsightCard: {
    marginTop: spacing.md,
    backgroundColor: colors.aiLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.aiBorder,
  },
  aiHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  aiTitle: { fontSize: 13, fontWeight: "700", color: colors.aiDark },
  aiSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionHeading: { fontSize: 16, fontWeight: "700", color: colors.text },
  sectionSubHeading: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  viewAllBtn: { paddingVertical: 4 },
  viewAllText: { fontSize: 13, color: colors.primary, fontWeight: "700" },
  loadingContainer: { padding: spacing.xl, alignItems: "center", gap: spacing.xs },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 13 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: spacing.lg },
  uploadFirstBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  uploadFirstBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  recordRow: {
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
  recordIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  recordTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  recordSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  aiStatusBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  aiStatusText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
});
