import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTimeline, type TimelineEvent } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

const TYPE_LABELS: Record<TimelineEvent["type"], { label: string; color: string }> = {
  record_uploaded: { label: "Upload", color: "#0B4F6C" },
  diagnosis: { label: "Diagnosis", color: "#B23A48" },
  lab_result: { label: "Lab", color: "#1B7F4F" },
  vaccination: { label: "Vaccine", color: "#5A2A82" },
  allergy_recorded: { label: "Allergy", color: "#A85800" },
  medication_started: { label: "Med start", color: "#0B4F6C" },
  medication_discontinued: { label: "Med stop", color: "#5B6C7A" },
};

export default function TimelineScreen() {
  const tl = useTimeline();

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={tl.isFetching} onRefresh={() => void tl.refetch()} tintColor={colors.primary} />
      }
    >
      <Text style={styles.title}>Timeline</Text>
      <Text style={styles.subtitle}>Your full health story, in order.</Text>

      {tl.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : tl.error ? (
        <Text style={styles.error}>{(tl.error as Error).message}</Text>
      ) : (tl.data?.items.length ?? 0) === 0 ? (
        <Text style={styles.muted}>No events yet.</Text>
      ) : (
        groupByDate(tl.data!.items).map(([date, events]) => (
          <View key={date} style={styles.group}>
            <Text style={styles.dateHeader}>{formatDate(date)}</Text>
            {events.map((e) => {
              const meta = TYPE_LABELS[e.type] ?? { label: e.type, color: colors.textMuted };
              return (
                <View key={e.id} style={styles.row}>
                  <View style={[styles.typePill, { backgroundColor: `${meta.color}1A`, borderColor: meta.color }]}>
                    <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.rowTitle}>{e.title}</Text>
                    {e.description ? <Text style={styles.rowSub}>{e.description}</Text> : null}
                  </View>
                </View>
              );
            })}
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg, marginTop: spacing.xs, fontSize: 13 },
  group: { marginBottom: spacing.lg },
  dateHeader: {
    color: colors.textMuted,
    fontWeight: "600",
    marginBottom: spacing.sm,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  typeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
