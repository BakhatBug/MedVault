import { useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useOutgoingAccess, type AccessPermission } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

const STATUS_STYLE: Record<AccessPermission["status"], { bg: string; fg: string; label: string }> = {
  REQUESTED: { bg: "#FFF1DA", fg: "#A85800", label: "PENDING" },
  APPROVED: { bg: "#E7F1E5", fg: "#1B7F4F", label: "ACTIVE" },
  DENIED: { bg: "#FBEAEA", fg: "#B23A48", label: "DENIED" },
  EXPIRED: { bg: "#E1E8ED", fg: "#5B6C7A", label: "EXPIRED" },
  REVOKED: { bg: "#E1E8ED", fg: "#5B6C7A", label: "REVOKED" },
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
      <Text style={styles.title}>Access requests</Text>
      <Text style={styles.subtitle}>Patients you&apos;ve asked for access, in order of most recent.</Text>

      {outgoing.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (outgoing.data?.items.length ?? 0) === 0 ? (
        <Text style={styles.muted}>No requests yet.</Text>
      ) : (
        outgoing.data!.items.map((r) => {
          const style = STATUS_STYLE[r.status];
          const tappable = r.status === "APPROVED";
          return (
            <Pressable
              key={r.id}
              onPress={() =>
                tappable
                  ? router.push({ pathname: "/(doctor)/patient/[code]", params: { code: r.patient.patientCode } })
                  : undefined
              }
              style={({ pressed }) => [styles.row, tappable && pressed && { opacity: 0.92 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.patient.fullName}</Text>
                <Text style={styles.code}>{r.patient.patientCode}</Text>
                <Text style={styles.meta}>
                  Requested {formatRelative(r.createdAt)}
                  {r.status === "APPROVED" && r.expiresAt
                    ? ` · expires ${formatRelative(r.expiresAt)}`
                    : ""}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: style.bg }]}>
                <Text style={[styles.pillText, { color: style.fg }]}>{style.label}</Text>
              </View>
            </Pressable>
          );
        })
      )}
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
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  name: { color: colors.text, fontWeight: "600", fontSize: 14 },
  code: { color: colors.textMuted, fontSize: 12, marginTop: 2, letterSpacing: 0.4 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
