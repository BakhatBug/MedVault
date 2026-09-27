import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTimeline, type TimelineEvent } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

const TYPE_CONFIG: Record<
  TimelineEvent["type"],
  { label: string; icon: string; bg: string; fg: string }
> = {
  record_uploaded: { label: "Upload", icon: "📁", bg: colors.primaryLight, fg: colors.primaryDark },
  diagnosis: { label: "Diagnosis", icon: "🩺", bg: colors.dangerLight, fg: colors.dangerText },
  lab_result: { label: "Lab Test", icon: "🧪", bg: colors.secondaryLight, fg: colors.secondaryText },
  vaccination: { label: "Vaccine", icon: "💉", bg: colors.aiLight, fg: colors.aiDark },
  allergy_recorded: { label: "Allergy", icon: "⚠️", bg: colors.warningLight, fg: colors.warningText },
  medication_started: { label: "Med Start", icon: "💊", bg: colors.successLight, fg: colors.successText },
  medication_discontinued: { label: "Med Stop", icon: "🛑", bg: colors.backgroundAlt, fg: colors.textMuted },
};

export default function TimelineScreen() {
  const tl = useTimeline();

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={tl.isFetching}
          onRefresh={() => void tl.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Health Timeline</Text>
        <Text style={styles.subtitle}>Your chronological longitudinal medical journey.</Text>
      </View>

      {tl.isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.muted}>Loading timeline…</Text>
        </View>
      ) : tl.error ? (
        <Text style={styles.error}>{(tl.error as Error).message}</Text>
      ) : (tl.data?.items.length ?? 0) === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>⏱️</Text>
          <Text style={styles.emptyTitle}>No Timeline Events Yet</Text>
          <Text style={styles.emptySub}>
            Uploaded records, diagnostic tests, and active medications will automatically appear here.
          </Text>
        </View>
      ) : (
        groupByDate(tl.data!.items).map(([date, events]) => (
          <View key={date} style={styles.group}>
            <View style={styles.dateHeaderBadge}>
              <Text style={styles.dateHeaderText}>📅 {formatDate(date)}</Text>
            </View>

            <View style={styles.timelineContainer}>
              <View style={styles.verticalLine} />
              {events.map((e) => {
                const cfg = TYPE_CONFIG[e.type] ?? {
                  label: e.type,
                  icon: "📌",
                  bg: colors.backgroundAlt,
                  fg: colors.textMuted,
                };
                return (
                  <View key={e.id} style={styles.timelineItem}>
                    <View style={[styles.timelineNode, { backgroundColor: cfg.bg }]}>
                      <Text style={{ fontSize: 14 }}>{cfg.icon}</Text>
                    </View>
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineCardTop}>
                        <Text style={styles.eventTitle}>{e.title}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.typeBadgeText, { color: cfg.fg }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {e.description ? <Text style={styles.eventDesc}>{e.description}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

function groupByDate(events: TimelineEvent[]): Array<[string, TimelineEvent[]]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const d = e.occurredAt.slice(0, 10);
    const list = groups.get(d);
    if (list) list.push(e);
    else groups.set(d, [e]);
  }
  return Array.from(groups.entries());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  group: { marginBottom: spacing.xl },
  dateHeaderBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  dateHeaderText: {
    color: colors.primaryDark,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  timelineContainer: { position: "relative", paddingLeft: spacing.lg },
  verticalLine: {
    position: "absolute",
    left: 31,
    top: 10,
    bottom: 10,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  timelineNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
    zIndex: 2,
    ...shadows.sm,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  timelineCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  eventTitle: { fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 },
  typeBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  typeBadgeText: { fontSize: 10, fontWeight: "800" },
  eventDesc: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  loadingContainer: { padding: spacing.xl, alignItems: "center" },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
