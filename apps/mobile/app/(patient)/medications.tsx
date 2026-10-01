import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useInteractions, useMedications, type Medication } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

const SEVERITY_CONFIG: Record<string, { bg: string; fg: string; border: string; icon: string }> = {
  major: { bg: colors.dangerLight, fg: colors.dangerText, border: colors.dangerBorder, icon: "alert-circle" },
  moderate: { bg: colors.warningLight, fg: colors.warningText, border: colors.warningBorder, icon: "warning" },
  minor: { bg: colors.infoLight, fg: colors.infoText, border: colors.infoBorder, icon: "information-circle" },
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
        <Text style={styles.subtitle}>Track active prescriptions and automated AI drug conflict checks.</Text>
      </View>

      {/* Segmented Tab Selector */}
      <View style={styles.tabSelector}>
        <Pressable
          onPress={() => setActiveTab("ACTIVE")}
          style={[styles.tabBtn, activeTab === "ACTIVE" && styles.tabBtnActive]}
        >
          <MaterialCommunityIcons
            name="pill"
            size={16}
            color={activeTab === "ACTIVE" ? colors.primaryDark : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "ACTIVE" && styles.tabBtnTextActive]}>
            Active ({activeMeds.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("HISTORY")}
          style={[styles.tabBtn, activeTab === "HISTORY" && styles.tabBtnActive]}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeTab === "HISTORY" ? colors.primaryDark : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "HISTORY" && styles.tabBtnTextActive]}>
            History ({historyMeds.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("INTERACTIONS")}
          style={[styles.tabBtn, activeTab === "INTERACTIONS" && styles.tabBtnActive]}
        >
          <Ionicons
            name="sparkles"
            size={15}
            color={activeTab === "INTERACTIONS" ? colors.aiDark : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === "INTERACTIONS" && styles.tabBtnTextActive]}>
            AI Check ({interactionList.length})
          </Text>
        </Pressable>
      </View>

      {/* Interactions View */}
      {activeTab === "INTERACTIONS" ? (
        <View style={{ marginTop: spacing.md }}>
          {interactionList.length === 0 ? (
            <View style={styles.emptySafeCard}>
              <View style={styles.emptySafeIconCircle}>
                <Ionicons name="shield-checkmark" size={32} color={colors.successDark} />
              </View>
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name={palette.icon as any} size={16} color={palette.fg} />
                      <Text style={[styles.severityBadge, { color: palette.fg }]}>
                        {i.severity.toUpperCase()} SEVERITY
                      </Text>
                    </View>
                    <Text style={styles.interactionMeds}>{i.medications.join(" + ")}</Text>
                  </View>
                  <Text style={styles.interactionDesc}>{i.description}</Text>
                </View>
              );
            })
          )}
          {interactions.data && "disclaimer" in interactions.data ? (
            <View style={styles.disclaimerCard}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.disclaimerText}>{interactions.data.disclaimer}</Text>
            </View>
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
              <View style={styles.emptyIconCircle}>
                <MaterialCommunityIcons name="pill" size={32} color={colors.textMuted} />
              </View>
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
              <View style={styles.emptyIconCircle}>
                <Ionicons name="time-outline" size={32} color={colors.textMuted} />
              </View>
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
        <View style={[styles.medIconBox, { backgroundColor: med.isActive ? "#EFF6FF" : colors.backgroundAlt }]}>
          <MaterialCommunityIcons
            name="pill"
            size={22}
            color={med.isActive ? "#2563EB" : colors.textMuted}
          />
        </View>
        <View style={{ flex: 1, paddingRight: spacing.xs }}>
          <Text style={styles.medName}>{med.name}</Text>
          {med.dosage ? <Text style={styles.dosagePill}>Dosage: {med.dosage}</Text> : null}
        </View>
        <View style={[styles.statusPill, med.isActive ? styles.statusPillActive : styles.statusPillPast]}>
          <Text style={[styles.statusText, med.isActive ? styles.statusTextActive : styles.statusTextPast]}>
            {med.isActive ? "Active" : "Discontinued"}
          </Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabBtnText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  tabBtnTextActive: { color: colors.text, fontWeight: "700" },
  emptySafeCard: {
    backgroundColor: colors.successLight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  emptySafeIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptySafeTitle: { fontSize: 16, fontWeight: "700", color: colors.successDark },
  emptySafeSub: { fontSize: 13, color: colors.successDark, textAlign: "center", marginTop: 4 },
  interactionCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  interactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  severityBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  interactionMeds: { fontSize: 12, fontWeight: "700", color: colors.text },
  interactionDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  disclaimerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  disclaimerText: { fontSize: 11, color: colors.textMuted, lineHeight: 16, flex: 1 },
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
  medCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  medCardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  medIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  medName: { fontSize: 15, fontWeight: "700", color: colors.text },
  dosagePill: { fontSize: 12, color: colors.primaryDark, fontWeight: "600", marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  statusPillActive: { backgroundColor: colors.successLight },
  statusPillPast: { backgroundColor: colors.backgroundAlt },
  statusText: { fontSize: 11, fontWeight: "700" },
  statusTextActive: { color: colors.successDark },
  statusTextPast: { color: colors.textMuted },
  medMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  medMetaLabel: { fontSize: 12, color: colors.textMuted },
  medMetaValue: { fontSize: 12, fontWeight: "600", color: colors.text },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
