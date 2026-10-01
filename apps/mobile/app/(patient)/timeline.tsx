import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTimeline, type TimelineEvent } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

type TypeConfig = {
  label: string;
  family: "ionicons" | "material";
  iconName: any;
  bg: string;
  fg: string;
};

const TYPE_CONFIG: Record<TimelineEvent["type"], TypeConfig> = {
  record_uploaded: { label: "Upload", family: "ionicons", iconName: "folder-outline", bg: colors.primaryLight, fg: colors.primaryDark },
  diagnosis: { label: "Diagnosis", family: "ionicons", iconName: "pulse", bg: colors.dangerLight, fg: colors.dangerText },
  lab_result: { label: "Lab Test", family: "material", iconName: "flask-outline", bg: colors.secondaryLight, fg: colors.secondaryText },
  vaccination: { label: "Vaccine", family: "material", iconName: "needle", bg: colors.aiLight, fg: colors.aiDark },
  allergy_recorded: { label: "Allergy", family: "ionicons", iconName: "alert-circle", bg: colors.warningLight, fg: colors.warningText },
  medication_started: { label: "Med Start", family: "material", iconName: "pill", bg: colors.successLight, fg: colors.successText },
  medication_discontinued: { label: "Med Stop", family: "material", iconName: "close-circle-outline", bg: colors.backgroundAlt, fg: colors.textMuted },
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
          <View style={styles.emptyIconCircle}>
            <Ionicons name="time-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Timeline Events Yet</Text>
          <Text style={styles.emptySub}>
            Uploaded records, diagnostic tests, and active medications will automatically appear here.
          </Text>
        </View>
      ) : (
        groupByDate(tl.data!.items).map(([date, events]) => (
          <View key={date} style={styles.group}>
            <View style={styles.dateHeaderBadge}>
              <Ionicons name="calendar-outline" size={13} color={colors.primaryDark} style={{ marginRight: 4 }} />
              <Text style={styles.dateHeaderText}>{formatDate(date)}</Text>
            </View>

            <View style={styles.timelineContainer}>
              <View style={styles.verticalLine} />
              {events.map((e) => {
                const cfg = TYPE_CONFIG[e.type] ?? {
                  label: e.type,
                  family: "ionicons",
                  iconName: "bookmark-outline",
                  bg: colors.backgroundAlt,
                  fg: colors.textMuted,
                };
                return (
                  <View key={e.id} style={styles.timelineItem}>
                    <View style={[styles.timelineNode, { backgroundColor: cfg.bg }]}>
                      {cfg.family === "material" ? (
                        <MaterialCommunityIcons name={cfg.iconName} size={15} color={cfg.fg} />
                      ) : (
                        <Ionicons name={cfg.iconName} size={15} color={cfg.fg} />
                      )}
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
    flexDirection: "row",
    alignItems: "center",
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
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  timelineCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xs,
  },
  eventTitle: { fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  eventDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 16 },
  loadingContainer: { padding: spacing.xxl, alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
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
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4 },
});
