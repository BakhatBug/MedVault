import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useInteractions, useMedications, type Medication } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

const SEVERITY_CONFIG: Record<string, { bg: string; fg: string; border: string }> = {
  major: { bg: colors.dangerLight, fg: colors.dangerText, border: colors.dangerBorder },
  moderate: { bg: colors.warningLight, fg: colors.warningText, border: colors.warningBorder },
  minor: { bg: colors.successLight, fg: colors.successText, border: colors.successBorder },
};

export default function MedicationsScreen() {
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "HISTORY" | "INTERACTIONS">("ACTIVE");
  const meds = useMedications(true);
  const interactions = useInteractions();

  const onRefresh = () => {
    void meds.refetch();
    void interactions.refetch();
  };

  const activeMeds = meds.data?.items.filter((m) => m.isActive) ?? [];
  const historyMeds = meds.data?.items.filter((m) => !m.isActive) ?? [];
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
      <View style={styles.header}>
        <Text style={styles.title}>Medications</Text>
        <Text style={styles.subtitle}>Track active prescriptions and AI automated drug conflict checks.</Text>
      </View>

      {/* Segmented Tab Selector */}
      <View style={styles.tabSelector}>
        <Pressable
          onPress={() => setActiveTab("ACTIVE")}
          style={[styles.tabBtn, activeTab === "ACTIVE" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabBtnText, activeTab === "ACTIVE" && styles.tabBtnTextActive]}>
            Active ({activeMeds.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("HISTORY")}
          style={[styles.tabBtn, activeTab === "HISTORY" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabBtnText, activeTab === "HISTORY" && styles.tabBtnTextActive]}>
            History ({historyMeds.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("INTERACTIONS")}
          style={[styles.tabBtn, activeTab === "INTERACTIONS" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabBtnText, activeTab === "INTERACTIONS" && styles.tabBtnTextActive]}>
            AI Conflict Check ({interactionList.length})
          </Text>
        </Pressable>
      </View>

      {/* Interactions View */}
      {activeTab === "INTERACTIONS" ? (
        <View style={{ marginTop: spacing.md }}>
          {interactionList.length === 0 ? (
            <View style={styles.emptySafeCard}>
              <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>✅</Text>
              <Text style={styles.emptySafeTitle}>No Drug Conflicts Detected</Text>
              <Text style={styles.emptySafeSub}>
                The clinical AI checked your active medications against known pharmacology conflict databases.
              </Text>
            </View>
          ) : (
            interactionList.map((i, idx) => {
              const palette = SEVERITY_CONFIG[i.severity] ?? SEVERITY_CONFIG["minor"]!;
              return (
                <View
                  key={idx}
                  style={[
                    styles.interactionCard,
                    { backgroundColor: palette.bg, borderColor: palette.border },
                  ]}
                >
                  <View style={styles.interactionHeader}>
                    <Text style={[styles.severityBadge, { color: palette.fg }]}>
                      {i.severity.toUpperCase()} SEVERITY
                    </Text>
                    <Text style={styles.interactionMeds}>{i.medications.join(" + ")}</Text>
                  </View>
                  <Text style={styles.interactionDesc}>{i.description}</Text>
                </View>
              );
            })
          )}
          {interactions.data && "disclaimer" in interactions.data ? (
            <Text style={styles.disclaimer}>{interactions.data.disclaimer}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Active Meds View */}
      {activeTab === "ACTIVE" ? (
        <View style={{ marginTop: spacing.md }}>
          {meds.isLoading ? (
            <Text style={styles.muted}>Loading medications…</Text>
          ) : meds.error ? (
            <Text style={styles.error}>{(meds.error as Error).message}</Text>
          ) : activeMeds.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>💊</Text>
              <Text style={styles.emptyTitle}>No Active Medications</Text>
              <Text style={styles.emptySub}>
                Upload prescriptions in the Records tab to automatically extract active medications.
              </Text>
            </View>
          ) : (
            activeMeds.map((m) => <MedCard key={m.id} med={m} />)
          )}
        </View>
      ) : null}

      {/* History Meds View */}
      {activeTab === "HISTORY" ? (
        <View style={{ marginTop: spacing.md }}>
          {meds.isLoading ? (
            <Text style={styles.muted}>Loading history…</Text>
          ) : meds.error ? (
            <Text style={styles.error}>{(meds.error as Error).message}</Text>
          ) : historyMeds.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Discontinued Medications</Text>
              <Text style={styles.emptySub}>Completed or past medication courses will appear here.</Text>
            </View>
          ) : (
            historyMeds.map((m) => <MedCard key={m.id} med={m} />)
          )}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function MedCard({ med }: { med: Medication }) {
  return (
    <View style={styles.medCard}>
      <View style={styles.medCardTop}>
        <View style={styles.medIconBox}>
          <Text style={{ fontSize: 20 }}>💊</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.medName}>{med.name}</Text>
          {med.dosage ? <Text style={styles.dosagePill}>Dosage: {med.dosage}</Text> : null}
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{med.isActive ? "Active" : "Discontinued"}</Text>
        </View>
      </View>
      {med.frequency ? (
        <View style={styles.medMetaRow}>
          <Text style={styles.medMetaLabel}>Frequency / Schedule:</Text>
          <Text style={styles.medMetaValue}>{med.frequency}</Text>
        </View>
      ) : null}
      {med.prescribingDoctor ? (
        <View style={styles.medMetaRow}>
          <Text style={styles.medMetaLabel}>Prescriber:</Text>
          <Text style={styles.medMetaValue}>{med.prescribingDoctor}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  tabSelector: {
    flexDirection: "row",
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabBtnText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  tabBtnTextActive: { color: colors.primaryDark },
  medCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  medCardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  medIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  medName: { fontSize: 16, fontWeight: "800", color: colors.text },
  dosagePill: { fontSize: 12, color: colors.primaryDark, fontWeight: "700", marginTop: 2 },
  statusPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusText: { fontSize: 11, fontWeight: "700", color: colors.successText },
  medMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  medMetaLabel: { fontSize: 12, color: colors.textMuted },
  medMetaValue: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
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
  emptySafeCard: {
    backgroundColor: colors.successLight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  emptySafeTitle: { fontSize: 16, fontWeight: "800", color: colors.successText },
  emptySafeSub: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 4 },
  interactionCard: {
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  interactionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  severityBadge: { fontSize: 10, fontWeight: "800" },
  interactionMeds: { color: colors.text, fontWeight: "700", fontSize: 13 },
  interactionDesc: { color: colors.textSecondary, marginTop: 4, fontSize: 12, lineHeight: 17 },
  disclaimer: { color: colors.textMuted, fontSize: 11, fontStyle: "italic", marginTop: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
