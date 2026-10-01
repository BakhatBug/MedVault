import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { RecordDetailModal } from "../../components/RecordDetailModal";
import { MedicalIcon } from "../../components/MedicalIcon";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useRecordDetail, useRecords, useRecordViewUrl } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

type CategoryItem = {
  key: string;
  label: string;
  iconFamily: "ionicons" | "material" | "feather";
  iconName: any;
};

const CATEGORIES: CategoryItem[] = [
  { key: "ALL", label: "All Folders", iconFamily: "ionicons", iconName: "folder-open-outline" },
  { key: "PRESCRIPTION", label: "Prescriptions", iconFamily: "material", iconName: "pill" },
  { key: "LAB_RESULT", label: "Lab Results", iconFamily: "material", iconName: "flask-round-bottom-outline" },
  { key: "IMAGING", label: "Imaging & Scans", iconFamily: "material", iconName: "radiology-box-outline" },
  { key: "DISCHARGE_SUMMARY", label: "Discharge", iconFamily: "material", iconName: "clipboard-pulse-outline" },
  { key: "CONSULTATION_NOTE", label: "Doctor Notes", iconFamily: "ionicons", iconName: "document-text-outline" },
  { key: "VACCINATION", label: "Vaccines", iconFamily: "material", iconName: "needle" },
  { key: "OTHER", label: "Other", iconFamily: "ionicons", iconName: "document-outline" },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  PENDING: { label: "Processing…", bg: colors.warningLight, fg: colors.warningText, dot: "#F59E0B" },
  PROCESSING: { label: "Extracting AI…", bg: colors.aiLight, fg: colors.aiDark, dot: "#6366F1" },
  COMPLETED: { label: "AI Extracted", bg: colors.successLight, fg: colors.successText, dot: "#10B981" },
  FAILED_RETRYABLE: { label: "Retrying AI", bg: colors.warningLight, fg: colors.warningText, dot: "#F59E0B" },
  FAILED_PERMANENT: { label: "AI Unavailable", bg: colors.backgroundAlt, fg: colors.textMuted, dot: "#94A3B8" },
  UNAVAILABLE: { label: "AI Unavailable", bg: colors.backgroundAlt, fg: colors.textMuted, dot: "#94A3B8" },
};

export default function RecordsScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const records = useRecords(selectedCategory === "ALL" ? undefined : selectedCategory);
  const recordDetail = useRecordDetail(selectedRecordId);
  const recordViewUrl = useRecordViewUrl(selectedRecordId);

  const filteredItems = useMemo(() => {
    const items = records.data?.items ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [records.data, searchQuery]);

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={records.isFetching}
          onRefresh={() => void records.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Medical Vault</Text>
          <Text style={styles.subtitle}>Categorized health records with AI clinical extraction.</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(patient)/upload")}
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Upload a new medical record"
        >
          <Ionicons name="add" size={16} color={colors.primaryText} />
          <Text style={styles.addButtonText}>Upload</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search records by title, doctor, or folder…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category Folders Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {CATEGORIES.map((c) => {
          const isSelected = selectedCategory === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setSelectedCategory(c.key)}
              style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
            >
              {c.iconFamily === "ionicons" && (
                <Ionicons
                  name={c.iconName}
                  size={15}
                  color={isSelected ? colors.surface : colors.primaryDark}
                  style={{ marginRight: 5 }}
                />
              )}
              {c.iconFamily === "material" && (
                <MaterialCommunityIcons
                  name={c.iconName}
                  size={15}
                  color={isSelected ? colors.surface : colors.primaryDark}
                  style={{ marginRight: 5 }}
                />
              )}
              {c.iconFamily === "feather" && (
                <Feather
                  name={c.iconName}
                  size={15}
                  color={isSelected ? colors.surface : colors.primaryDark}
                  style={{ marginRight: 5 }}
                />
              )}
              <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Records Feed */}
      {records.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>Loading vault documents…</Text>
        </View>
      ) : records.error ? (
        <Text style={styles.error}>{(records.error as Error).message}</Text>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No records in this folder</Text>
          <Text style={styles.emptySub}>
            {searchQuery
              ? "No documents matched your search query."
              : "Upload a document, prescription, or lab result to see it here."}
          </Text>
          <Pressable
            onPress={() => router.push("/(patient)/upload")}
            style={({ pressed }) => [styles.uploadEmptyBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={17} color="#FFFFFF" />
            <Text style={styles.uploadEmptyBtnText}>Upload Medical Document</Text>
          </Pressable>
        </View>
      ) : (
        filteredItems.map((r) => {
          const status = STATUS_CONFIG[r.aiStatus] ?? {
            label: r.aiStatus,
            bg: colors.backgroundAlt,
            fg: colors.textMuted,
            dot: "#94A3B8",
          };

          return (
            <Pressable
              key={r.id}
              onPress={() => setSelectedRecordId(r.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.cardTopRow}>
                <MedicalIcon category={r.category} size={44} />
                <View style={{ flex: 1, paddingRight: spacing.xs }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.rowSub}>
                    {r.category.replace(/_/g, " ").toLowerCase()} · {new Date(r.uploadedAt).toLocaleDateString()} ·{" "}
                    {formatBytes(r.sizeBytes)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: status.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                  <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
                </View>
              </View>

              <View style={styles.cardBottomRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="sparkles" size={12} color={colors.ai} />
                  <Text style={styles.cardHint}>Click to view AI extracted clinical data</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Text style={styles.inspectBtn}>Inspect AI Data</Text>
                  <Feather name="arrow-right" size={12} color={colors.primaryDark} />
                </View>
              </View>
            </Pressable>
          );
        })
      )}

      {/* AI Extraction Detail Modal */}
      <RecordDetailModal
        visible={!!selectedRecordId}
        onClose={() => setSelectedRecordId(null)}
        record={recordDetail.data ?? null}
        loading={recordDetail.isLoading}
        viewUrl={recordViewUrl.data?.url ?? null}
        loadingViewUrl={recordViewUrl.isLoading}
      />
    </ScreenContainer>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    ...shadows.sm,
  },
  addButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.text },
  clearBtn: { padding: spacing.xs },
  categoryScroll: {
    flexDirection: "row",
    gap: spacing.xs + 2,
    paddingBottom: spacing.md,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  categoryTextActive: {
    color: colors.surface,
    fontWeight: "700",
  },
  loadingBox: { padding: spacing.xxl, alignItems: "center" },
  muted: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 13 },
  error: { color: colors.danger, marginVertical: spacing.md, fontSize: 13 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
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
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: spacing.lg },
  uploadEmptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  uploadEmptyBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rowPressed: { backgroundColor: colors.backgroundAlt },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  cardHint: { fontSize: 11, color: colors.textMuted },
  inspectBtn: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
});
