import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useInteractions, useMedications, type Medication } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

const SEVERITY_STYLE: Record<string, { bg: string; fg: string }> = {
  major: { bg: "#FBEAEA", fg: "#B23A48" },
  moderate: { bg: "#FFF1DA", fg: "#A85800" },
  minor: { bg: "#E7F1E5", fg: "#1B7F4F" },
};

export default function MedicationsScreen() {
  const meds = useMedications(true);
  const interactions = useInteractions();

  const onRefresh = () => {
    void meds.refetch();
    void interactions.refetch();
  };

  const interactionList =
    interactions.data && "interactions" in interactions.data ? interactions.data.interactions : [];

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={meds.isFetching || interactions.isFetching}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.title}>Medications</Text>
      <Text style={styles.subtitle}>Active and historical medications, with AI interaction checks.</Text>

      {interactionList.length > 0 ? (
        <View style={styles.alertBlock}>
          <Text style={styles.alertTitle}>Possible interactions</Text>
          {interactionList.map((i, idx) => {
            const palette = SEVERITY_STYLE[i.severity] ?? SEVERITY_STYLE["minor"]!;
            return (
              <View
                key={`${i.medications.join("+")}-${idx}`}
                style={[styles.interactionRow, { backgroundColor: palette.bg }]}
              >
                <Text style={[styles.severity, { color: palette.fg }]}>{i.severity.toUpperCase()}</Text>
                <Text style={styles.interactionMeds}>{i.medications.join(" + ")}</Text>
                <Text style={styles.interactionDesc}>{i.description}</Text>
              </View>
            );
          })}
          {interactions.data && "disclaimer" in interactions.data ? (
            <Text style={styles.disclaimer}>{interactions.data.disclaimer}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Active</Text>
      {renderList(meds.data?.items.filter((m) => m.isActive) ?? [], meds.isLoading, meds.error)}

      <Text style={styles.sectionTitle}>History</Text>
      {renderList(
        meds.data?.items.filter((m) => !m.isActive) ?? [],
        meds.isLoading,
        meds.error,
        "No discontinued medications.",
      )}
    </ScreenContainer>
  );
}

function renderList(
  items: Medication[],
  loading: boolean,
  error: unknown,
  emptyText = "Nothing here yet.",
) {
  if (loading) return <Text style={styles.muted}>Loading…</Text>;
  if (error) return <Text style={styles.error}>{(error as Error).message}</Text>;
  if (items.length === 0) return <Text style={styles.muted}>{emptyText}</Text>;
  return items.map((m) => (
    <View key={m.id} style={styles.row}>
      <Text style={styles.rowTitle}>
        {m.name}
        {m.dosage ? ` · ${m.dosage}` : ""}
      </Text>
      {m.frequency ? <Text style={styles.rowSub}>{m.frequency}</Text> : null}
      {m.prescribingDoctor ? (
        <Text style={styles.rowMeta}>Prescribed by {m.prescribingDoctor}</Text>
      ) : null}
    </View>
  ));
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg, marginTop: spacing.xs, fontSize: 13 },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  alertBlock: { marginBottom: spacing.md },
  alertTitle: { fontWeight: "700", color: colors.text, marginBottom: spacing.sm, fontSize: 15 },
  interactionRow: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  severity: { fontSize: 10, fontWeight: "700", marginBottom: spacing.xs },
  interactionMeds: { color: colors.text, fontWeight: "600", fontSize: 14 },
  interactionDesc: { color: colors.text, marginTop: spacing.xs, fontSize: 13 },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
