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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MedicalIcon } from "../../components/MedicalIcon";
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
            <Ionicons name="shield-checkmark" size={13} color={colors.primaryDark} />
            <Text style={styles.vaultShieldText}>Vault Active</Text>
          </View>
        </View>

        {patientCode ? (
          <View style={styles.codeContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="finger-print-outline" size={16} color={colors.textMuted} />
              <Text style={styles.codeLabel}>Patient ID</Text>
            </View>
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
            <MaterialCommunityIcons name="doctor" size={22} color={colors.warningText} />
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
            <Text style={styles.reviewPillText}>Review</Text>
            <Feather name="chevron-right" size={14} color={colors.surface} />
          </View>
        </Pressable>
      ) : null}

      {/* Quick Action Grid */}
      <View style={styles.quickActionRow}>
        <QuickActionItem
          iconFamily="feather"
          iconName="upload-cloud"
          iconColor="#0D9488"
          iconBg="#F0FDFA"
          label="Upload"
          sub="Add record"
          onPress={() => router.push("/(patient)/upload")}
        />
        <QuickActionItem
          iconFamily="material"
          iconName="pill"
          iconColor="#2563EB"
          iconBg="#EFF6FF"
          label="Meds"
          sub="Prescriptions"
          onPress={() => router.push("/(patient)/medications")}
        />
        <QuickActionItem
          iconFamily="ionicons"
          iconName="qr-code-outline"
          iconColor="#E11D48"
          iconBg="#FFF1F2"
          label="Emergency"
          sub="Public QR"
          onPress={() => router.push("/(patient)/emergency")}
        />
        <QuickActionItem
          iconFamily="material"
          iconName="stethoscope"
          iconColor="#7C3AED"
          iconBg="#F5F3FF"
          label="Doctors"
          sub={`${approvedDoctors.length} active`}
          onPress={() => router.push("/(patient)/access")}
        />
      </View>

      {/* Stats Summary Grid */}
      <View style={styles.statsGrid}>
        <MetricCard
          icon={<Ionicons name="folder-outline" size={16} color={colors.primary} />}
          label="Vault Records"
          value={String(recordCount)}
          caption="Documents in vault"
          onPress={() => router.push("/(patient)/records")}
        />
        <MetricCard
          icon={<MaterialCommunityIcons name="pill" size={16} color="#2563EB" />}
          label="Active Meds"
          value={String(activeMedsCount)}
          caption="Currently taking"
          onPress={() => router.push("/(patient)/medications")}
        />
        <MetricCard
          icon={<Ionicons name="pulse-outline" size={16} color="#16A34A" />}
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
            <Ionicons name="warning" size={18} color={colors.danger} />
            <Text style={styles.alertTitle}>Major Drug Interaction Warning</Text>
          </View>
          <Text style={styles.alertBody}>
            The AI detected a potential conflict between active medications. Tap to review details with your doctor.
          </Text>
        </Pressable>
      ) : null}

      {/* AI Clinical Assistant Feature Banner with Gradient */}
      <Pressable
        onPress={() => router.push("/(patient)/ai" as any)}
        style={({ pressed }) => [styles.aiBannerPressable, pressed && { opacity: 0.94 }]}
      >
        <LinearGradient
          colors={["#4F46E5", "#6366F1", "#818CF8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.aiInsightCard}
        >
          <View style={styles.aiHeader}>
            <View style={styles.aiIconBadge}>
              <Ionicons name="sparkles" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.aiTitle}>AI Clinical Assistant & Insights</Text>
                <View style={styles.openAiPill}>
                  <Text style={styles.openAiText}>Open</Text>
                  <Feather name="chevron-right" size={13} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.aiSub}>
                Ask questions about your health records, explain lab values, or view your longitudinal summary.
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>

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
          <Text style={styles.viewAllText}>View All</Text>
          <Feather name="arrow-right" size={13} color={colors.primary} />
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
          <View style={styles.emptyIconCircle}>
            <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Your Vault is Empty</Text>
          <Text style={styles.emptyBody}>Upload your first prescription, lab report, or scan to get started.</Text>
          <Pressable
            onPress={() => router.push("/(patient)/upload")}
            style={({ pressed }) => [styles.uploadFirstBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.uploadFirstBtnText}>Upload Medical Record</Text>
          </Pressable>
        </View>
      ) : (
        records.data!.items.slice(0, 3).map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push("/(patient)/records")}
            style={({ pressed }) => [styles.recordRow, pressed && { opacity: 0.9 }]}
          >
            <MedicalIcon category={r.category} size={42} />
            <View style={{ flex: 1, paddingRight: spacing.xs }}>
              <Text style={styles.recordTitle} numberOfLines={1}>
                {r.title}
              </Text>
              <Text style={styles.recordSub}>
                {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()}
              </Text>
            </View>
            <View
              style={[
                styles.aiStatusBadge,
                r.aiStatus === "COMPLETED" ? styles.aiBadgeDone : styles.aiBadgeProcessing,
              ]}
            >
              <View
                style={[
                  styles.aiStatusDot,
                  { backgroundColor: r.aiStatus === "COMPLETED" ? colors.success : colors.warning },
                ]}
              />
              <Text
                style={[
                  styles.aiStatusText,
                  { color: r.aiStatus === "COMPLETED" ? colors.successDark : colors.warningText },
                ]}
              >
                {r.aiStatus === "COMPLETED" ? "Extracted" : "Processing"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

function QuickActionItem({
  iconFamily,
  iconName,
  iconColor,
  iconBg,
  label,
  sub,
  onPress,
}: {
  iconFamily: "ionicons" | "material" | "feather";
  iconName: any;
  iconColor: string;
  iconBg: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickActionBtn, pressed && styles.quickActionBtnPressed]}
    >
      <View style={[styles.quickActionIconBox, { backgroundColor: iconBg }]}>
        {iconFamily === "ionicons" && <Ionicons name={iconName} size={19} color={iconColor} />}
        {iconFamily === "material" && <MaterialCommunityIcons name={iconName} size={20} color={iconColor} />}
        {iconFamily === "feather" && <Feather name={iconName} size={19} color={iconColor} />}
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
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.metricCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.metricHeader}>
        {icon}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
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
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  metricLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  metricValue: { fontSize: 22, fontWeight: "800", color: colors.primaryDark, letterSpacing: -0.5 },
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
  aiBannerPressable: {
    marginTop: spacing.md,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadows.md,
  },
  aiInsightCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  aiHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  aiIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  openAiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  openAiText: { fontSize: 11, color: "#FFFFFF", fontWeight: "700" },
  aiSub: { fontSize: 12, color: "rgba(255, 255, 255, 0.9)", lineHeight: 17, marginTop: 4 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionHeading: { fontSize: 16, fontWeight: "700", color: colors.text },
  sectionSubHeading: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 4 },
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
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: spacing.lg },
  uploadFirstBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  recordTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  recordSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  aiStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  aiBadgeDone: {
    backgroundColor: colors.successLight,
  },
  aiBadgeProcessing: {
    backgroundColor: colors.warningLight,
  },
  aiStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiStatusText: { fontSize: 11, fontWeight: "700" },
});
