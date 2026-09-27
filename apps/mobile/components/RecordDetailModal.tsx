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
import { colors, radius, spacing } from "../lib/theme";

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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={styles.title} numberOfLines={2}>
                {record?.title ?? "Record Details"}
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
              <Text style={styles.loadingText}>Loading document & AI extraction…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Status Banner */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    record?.aiStatus === "COMPLETED" ? styles.statusBadgeDone : styles.statusBadgePending,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      record?.aiStatus === "COMPLETED" ? styles.statusBadgeTextDone : styles.statusBadgeTextPending,
                    ]}
                  >
                    {record?.aiStatus === "COMPLETED"
                      ? "AI Extraction: Completed"
                      : record?.aiStatus === "PROCESSING" || record?.aiStatus === "PENDING"
                      ? "AI Extraction: Processing…"
                      : "AI Extraction: Unavailable"}
                  </Text>
                </View>
                {record?.sizeBytes ? (
                  <Text style={styles.sizeText}>{formatBytes(record.sizeBytes)}</Text>
                ) : null}
              </View>

              {record?.notes ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Notes</Text>
                  <Text style={styles.notesText}>{record.notes}</Text>
                </View>
              ) : null}

              {/* AI Extraction Section */}
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardTitle}>AI Extracted Clinical Entities</Text>
                  <Text style={styles.aiCardSub}>Parsed into structured FHIR clinical schema</Text>
                </View>

                {!hasEntities ? (
                  <Text style={styles.emptyText}>
                    {record?.aiStatus === "COMPLETED"
                      ? "No clinical entities (medications, conditions, labs) were detected in this document."
                      : "AI analysis is in progress. Check back in a moment."}
                  </Text>
                ) : null}

                {/* Conditions */}
                {conditions.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <Text style={styles.groupLabel}>Diagnoses & Conditions ({conditions.length})</Text>
                    {conditions.map((c, i) => (
                      <View key={i} style={styles.entityItem}>
                        <Text style={styles.entityTitle}>• {c.name}</Text>
                        {c.status ? <Text style={styles.entitySub}>Status: {c.status}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Medications */}
                {medications.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <Text style={styles.groupLabel}>Medications & Prescriptions ({medications.length})</Text>
                    {medications.map((m, i) => (
                      <View key={i} style={styles.entityItem}>
                        <Text style={styles.entityTitle}>💊 {m.name}</Text>
                        {m.dosage ? <Text style={styles.entitySub}>Dosage / Sig: {m.dosage}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Observations / Labs */}
                {observations.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <Text style={styles.groupLabel}>Lab Observations & Biomarkers ({observations.length})</Text>
                    {observations.map((o, i) => (
                      <View key={i} style={styles.labItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.entityTitle}>{o.test}</Text>
                          {o.referenceRange ? (
                            <Text style={styles.entitySub}>Ref: {o.referenceRange}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.labValue}>{o.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Allergies */}
                {allergies.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <Text style={styles.groupLabel}>Allergies ({allergies.length})</Text>
                    {allergies.map((a, i) => (
                      <View key={i} style={styles.entityItem}>
                        <Text style={[styles.entityTitle, { color: colors.danger }]}>⚠️ {a.substance}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Immunizations */}
                {immunizations.length > 0 ? (
                  <View style={styles.entityGroup}>
                    <Text style={styles.groupLabel}>Immunizations ({immunizations.length})</Text>
                    {immunizations.map((im, i) => (
                      <View key={i} style={styles.entityItem}>
                        <Text style={styles.entityTitle}>💉 {im.vaccine}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                {viewUrl ? (
                  <Pressable
                    onPress={openDoc}
                    disabled={loadingViewUrl}
                    style={({ pressed }) => [styles.viewDocBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.viewDocBtnText}>
                      {loadingViewUrl ? "Opening…" : "Open Original Document ↗"}
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalBox: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: "700" },
  loadingContainer: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  scrollContent: { padding: spacing.lg, gap: spacing.md },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeDone: { backgroundColor: "#E6F4EA" },
  statusBadgePending: { backgroundColor: "#FFF8E1" },
  statusBadgeText: { fontSize: 12, fontWeight: "600" },
  statusBadgeTextDone: { color: "#137333" },
  statusBadgeTextPending: { color: "#B06000" },
  sizeText: { fontSize: 12, color: colors.textMuted },
  section: { backgroundColor: colors.background, padding: spacing.md, borderRadius: radius.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 4 },
  notesText: { fontSize: 13, color: colors.text },
  aiCard: {
    backgroundColor: "#F4F7FB",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#D3E3FD",
  },
  aiCardHeader: { marginBottom: spacing.sm },
  aiCardTitle: { fontSize: 15, fontWeight: "700", color: colors.primary },
  aiCardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: 13, color: colors.textMuted, fontStyle: "italic", paddingVertical: spacing.sm },
  entityGroup: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "#E1ECF1" },
  groupLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 4 },
  entityItem: { paddingVertical: 3 },
  entityTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
  entitySub: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.md },
  labItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  labValue: { fontSize: 13, fontWeight: "700", color: colors.primary },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  viewDocBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  viewDocBtnText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  doneBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  doneBtnText: { color: colors.text, fontWeight: "600", fontSize: 14 },
});
