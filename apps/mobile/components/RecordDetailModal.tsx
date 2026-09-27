import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type RecordDetail } from "../lib/queries";
import { colors, radius, shadows, spacing } from "../lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  record: RecordDetail | null;
  loading?: boolean;
  viewUrl?: string | null;
  loadingViewUrl?: boolean;
};

export function RecordDetailModal({
  visible,
  onClose,
  record,
  loading = false,
  viewUrl,
  loadingViewUrl = false,
}: Props) {
  if (!visible) return null;

  const fhirEntries = record?.extractedFhir?.entry ?? [];

  const conditions = fhirEntries
    .filter((e) => e.resource?.resourceType === "Condition")
    .map((e) => ({
      name: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display || "Condition",
      status: e.resource?.clinicalStatus?.coding?.[0]?.code,
      onset: e.resource?.onsetDateTime,
    }));

  const medications = fhirEntries
    .filter((e) => e.resource?.resourceType === "MedicationRequest")
    .map((e) => ({
      name:
        e.resource?.medicationCodeableConcept?.text ||
        e.resource?.medicationCodeableConcept?.coding?.[0]?.display ||
        "Medication",
      dosage:
        e.resource?.dosageInstruction?.[0]?.text ||
        (e.resource?.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity
          ? `${e.resource.dosageInstruction[0].doseAndRate[0].doseQuantity.value} ${e.resource.dosageInstruction[0].doseAndRate[0].doseQuantity.unit ?? ""}`
          : null),
    }));

  const observations = fhirEntries
    .filter((e) => e.resource?.resourceType === "Observation")
    .map((e) => {
      const reading =
        e.resource?.valueQuantity !== undefined
          ? `${e.resource.valueQuantity.value ?? ""} ${e.resource.valueQuantity.unit ?? ""}`.trim()
          : e.resource?.valueString || "—";
      const ref =
        e.resource?.referenceRange?.[0]?.text ||
        (e.resource?.referenceRange?.[0]?.low && e.resource?.referenceRange?.[0]?.high
          ? `${e.resource.referenceRange[0].low.value} - ${e.resource.referenceRange[0].high.value} ${e.resource.referenceRange[0].high.unit ?? ""}`
          : null);
      return {
        test: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display || "Lab Observation",
        value: reading,
        referenceRange: ref,
      };
    });

  const allergies = fhirEntries
    .filter((e) => e.resource?.resourceType === "AllergyIntolerance")
    .map((e) => ({
      substance: e.resource?.code?.text || e.resource?.code?.coding?.[0]?.display || "Allergy",
    }));

  const immunizations = fhirEntries
    .filter((e) => e.resource?.resourceType === "Immunization")
    .map((e) => ({
      vaccine:
        (e.resource as { vaccineCode?: { text?: string } })?.vaccineCode?.text ||
        "Vaccine",
    }));

  const hasEntities =
    conditions.length > 0 ||
    medications.length > 0 ||
    observations.length > 0 ||
    allergies.length > 0 ||
    immunizations.length > 0;

  async function openDoc() {
    if (!viewUrl) return;
    if (Platform.OS === "web") {
      window.open(viewUrl, "_blank");
    } else {
      await Linking.openURL(viewUrl);
    }
  }

  const catIcon =
    record?.category === "PRESCRIPTION"
      ? "💊"
      : record?.category === "LAB_RESULT"
      ? "🧪"
      : record?.category === "IMAGING"
      ? "🩻"
      : record?.category === "DISCHARGE_SUMMARY"
      ? "📋"
      : "📄";

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerIconBox}>
              <Text style={{ fontSize: 22 }}>{catIcon}</Text>
            </View>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={styles.title} numberOfLines={2}>
                {record?.title ?? "Document Details"}
              </Text>
              <Text style={styles.sub}>
                {record?.category.replace(/_/g, " ").toLowerCase()} ·{" "}
                {record?.uploadedAt ? new Date(record.uploadedAt).toLocaleDateString() : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading document & AI clinical extraction…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Status Banner */}
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      record?.aiStatus === "COMPLETED" ? styles.statusBadgeDone : styles.statusBadgePending,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            record?.aiStatus === "COMPLETED" ? colors.success : colors.warning,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusBadgeText,
                        record?.aiStatus === "COMPLETED"
                          ? styles.statusBadgeTextDone
                          : styles.statusBadgeTextPending,
                      ]}
                    >
                      {record?.aiStatus === "COMPLETED"
                        ? "FHIR AI Extraction: Complete"
                        : record?.aiStatus === "PROCESSING" || record?.aiStatus === "PENDING"
                        ? "FHIR AI Extraction: In Progress"
                        : "FHIR AI Extraction: Unavailable"}
                    </Text>
                  </View>
                  {record?.sizeBytes ? (
                    <Text style={styles.sizeText}>{formatBytes(record.sizeBytes)}</Text>
                  ) : null}
                </View>
              </View>

              {record?.notes ? (
                <View style={styles.notesSection}>
                  <Text style={styles.sectionTitle}>Document Notes</Text>
                  <Text style={styles.notesText}>{record.notes}</Text>
                </View>
              ) : null}

              {/* AI Extraction Section */}
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <View style={styles.aiTitleRow}>
                    <Text style={{ fontSize: 16 }}>✨</Text>
                    <Text style={styles.aiCardTitle}>AI Extracted Clinical Entities</Text>
                  </View>
                  <Text style={styles.aiCardSub}>Parsed into structured FHIR R4 clinical resources</Text>
                </View>

                {!hasEntities ? (
                  <Text style={styles.emptyText}>
                    {record?.aiStatus === "COMPLETED"
                      ? "No discrete entities (medications, conditions, observations) were detected in this document."
                      : "AI extraction is analyzing this file in the background. Refresh in a few seconds."}
                  </Text>
                ) : null}

                {/* Diagnoses & Conditions */}
                {conditions.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupIcon}>🩺</Text>
                      <Text style={styles.groupLabel}>Diagnoses & Conditions ({conditions.length})</Text>
                    </View>
                    {conditions.map((c, i) => (
                      <View key={i} style={styles.entityCard}>
                        <Text style={styles.entityTitle}>{c.name}</Text>
                        {c.status ? (
                          <View style={styles.conditionStatusPill}>
                            <Text style={styles.conditionStatusText}>{c.status}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Medications */}
                {medications.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupIcon}>💊</Text>
                      <Text style={styles.groupLabel}>Prescribed Medications ({medications.length})</Text>
                    </View>
                    {medications.map((m, i) => (
                      <View key={i} style={styles.entityCard}>
                        <Text style={styles.entityTitle}>{m.name}</Text>
                        {m.dosage ? (
                          <Text style={styles.dosageText}>Dosage / Sig: {m.dosage}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Lab Observations */}
                {observations.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupIcon}>🧪</Text>
                      <Text style={styles.groupLabel}>Biomarkers & Lab Readings ({observations.length})</Text>
                    </View>
                    {observations.map((o, i) => (
                      <View key={i} style={styles.labCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.entityTitle}>{o.test}</Text>
                          {o.referenceRange ? (
                            <Text style={styles.labRef}>Normal Range: {o.referenceRange}</Text>
                          ) : null}
                        </View>
                        <View style={styles.labValuePill}>
                          <Text style={styles.labValueText}>{o.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Allergies */}
                {allergies.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupIcon}>⚠️</Text>
                      <Text style={[styles.groupLabel, { color: colors.dangerText }]}>
                        Documented Allergies ({allergies.length})
                      </Text>
                    </View>
                    {allergies.map((a, i) => (
                      <View key={i} style={[styles.entityCard, { borderColor: colors.dangerBorder }]}>
                        <Text style={[styles.entityTitle, { color: colors.dangerText }]}>
                          ⚠️ {a.substance}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Immunizations */}
                {immunizations.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupIcon}>💉</Text>
                      <Text style={styles.groupLabel}>Immunizations ({immunizations.length})</Text>
                    </View>
                    {immunizations.map((im, i) => (
                      <View key={i} style={styles.entityCard}>
                        <Text style={styles.entityTitle}>{im.vaccine}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                {viewUrl ? (
                  <Pressable
                    onPress={openDoc}
                    disabled={loadingViewUrl}
                    style={({ pressed }) => [styles.viewDocBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.viewDocBtnText}>
                      {loadingViewUrl ? "Opening Document…" : "View Original Document ↗"}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.doneBtnText}>Close</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalBox: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    overflow: "hidden",
    ...shadows.xl,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontSize: 13, color: colors.textMuted, fontWeight: "700" },
  loadingContainer: { padding: spacing.xxxl, alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },
  scrollContent: { padding: spacing.lg, gap: spacing.md },
  statusCard: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeDone: { backgroundColor: colors.successLight },
  statusBadgePending: { backgroundColor: colors.warningLight },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  statusBadgeTextDone: { color: colors.successText },
  statusBadgeTextPending: { color: colors.warningText },
  sizeText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  notesSection: { backgroundColor: colors.backgroundAlt, padding: spacing.md, borderRadius: radius.lg },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 4 },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  aiCard: {
    backgroundColor: colors.aiLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
  },
  aiCardHeader: { marginBottom: spacing.md },
  aiTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiCardTitle: { fontSize: 15, fontWeight: "800", color: colors.aiDark },
  aiCardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: 13, color: colors.textMuted, fontStyle: "italic", paddingVertical: spacing.sm },
  entityGroup: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.aiBorder },
  groupHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  groupIcon: { fontSize: 14 },
  groupLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  entityCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entityTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  dosageText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600", marginTop: 2 },
  conditionStatusPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  conditionStatusText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  labCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labRef: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  labValuePill: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  labValueText: { fontSize: 13, fontWeight: "800", color: colors.secondaryText },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  viewDocBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    alignItems: "center",
    ...shadows.sm,
  },
  viewDocBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  doneBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  doneBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
});
