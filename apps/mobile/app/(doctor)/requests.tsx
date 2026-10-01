import { useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useOutgoingAccess, type AccessPermission } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

type StatusConfig = {
  bg: string;
  fg: string;
  border: string;
  label: string;
  icon: any;
};

const STATUS_CONFIG: Record<AccessPermission["status"], StatusConfig> = {
  REQUESTED: { bg: "#FEF3C7", fg: "#B45309", border: "#FDE68A", label: "PENDING CONSENT", icon: "time-outline" },
  APPROVED: { bg: "#DCFCE7", fg: "#15803D", border: "#BBF7D0", label: "ACTIVE ACCESS", icon: "checkmark-circle" },
  DENIED: { bg: "#FEE2E2", fg: "#B91C1C", border: "#FECACA", label: "DECLINED", icon: "close-circle" },
  EXPIRED: { bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0", label: "EXPIRED", icon: "time-outline" },
  REVOKED: { bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0", label: "REVOKED", icon: "lock-closed-outline" },
};

export default function RequestsScreen() {
  const outgoing = useOutgoingAccess();
  const router = useRouter();

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={outgoing.isFetching}
          onRefresh={() => void outgoing.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Access Requests</Text>
        <Text style={styles.subtitle}>
          Track patient consent approvals and active medical chart permissions.
        </Text>
      </View>

      {outgoing.isLoading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.muted}>Loading access requests…</Text>
        </View>
      ) : (outgoing.data?.items.length ?? 0) === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="shield-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Access Requests</Text>
          <Text style={styles.emptySub}>
            Use the Patient Search tab to look up a patient vault by Patient ID and submit an access request.
          </Text>
        </View>
      ) : (
        outgoing.data!.items.map((r) => {
          const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.EXPIRED;
          const isActive = r.status === "APPROVED";
          const initials = (r.patient.fullName ?? "PT")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          return (
            <Pressable
              key={r.id}
              onPress={() =>
                isActive
                  ? router.push({
                      pathname: "/(doctor)/patient/[code]",
                      params: { code: r.patient.patientCode },
                    })
                  : undefined
              }
              style={({ pressed }) => [
                styles.requestCard,
                isActive && styles.requestCardActive,
                isActive && pressed && { opacity: 0.92 },
              ]}
            >
              <View style={styles.topRow}>
                <View style={styles.patientInfo}>
                  <View style={[styles.avatar, isActive && styles.avatarActive]}>
                    <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{r.patient.fullName}</Text>
                    <View style={styles.codePill}>
                      <Text style={styles.codeText}>{r.patient.patientCode}</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Ionicons name={cfg.icon} size={12} color={cfg.fg} style={{ marginRight: 4 }} />
                  <Text style={[styles.statusBadgeText, { color: cfg.fg }]}>
                    {cfg.label}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.bottomRow}>
                <Text style={styles.metaText}>
                  Requested {formatRelative(r.createdAt)}
                  {isActive && r.expiresAt ? ` · Expires ${formatRelative(r.expiresAt)}` : ""}
                </Text>
                {isActive ? (
                  <View style={styles.viewChartBtn}>
                    <Text style={styles.viewChartText}>Open Chart</Text>
                    <Feather name="chevron-right" size={13} color={colors.primaryDark} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}

      <View style={{ height: spacing.xxl }} />
    </ScreenContainer>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const mins = Math.round(abs / 60_000);
  const hrs = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  if (hrs < 48) return future ? `in ${hrs}h` : `${hrs}h ago`;
  return future ? `in ${days}d` : `${days}d ago`;
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  loadingBox: { padding: spacing.xxl, alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 13 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, lineHeight: 18 },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  requestCardActive: { borderColor: colors.primaryMuted },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  patientInfo: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: { backgroundColor: colors.primaryLight },
  avatarText: { fontSize: 16, fontWeight: "800", color: colors.textMuted },
  avatarTextActive: { color: colors.primaryDark },
  patientName: { fontSize: 15, fontWeight: "700", color: colors.text },
  codePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
    marginTop: 2,
  },
  codeText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaText: { fontSize: 12, color: colors.textMuted },
  viewChartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  viewChartText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
});
