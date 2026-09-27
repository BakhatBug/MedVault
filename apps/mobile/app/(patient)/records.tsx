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
import { RecordDetailModal } from "../../components/RecordDetailModal";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useRecordDetail, useRecords, useRecordViewUrl } from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "All Folders" },
  { key: "PRESCRIPTION", label: "Prescriptions" },
  { key: "LAB_RESULT", label: "Lab Results" },
  { key: "IMAGING", label: "Imaging & Scans" },
  { key: "DISCHARGE_SUMMARY", label: "Discharge" },
  { key: "CONSULTATION_NOTE", label: "Doctor Notes" },
  { key: "VACCINATION", label: "Vaccines" },
  { key: "OTHER", label: "Other" },
];

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: "Processing…", bg: "#FFF8E1", fg: "#B06000" },
  PROCESSING: { label: "Extracting AI…", bg: "#FFF8E1", fg: "#B06000" },
  COMPLETED: { label: "AI Extracted", bg: "#E6F4EA", fg: "#137333" },
  FAILED_RETRYABLE: { label: "Retrying AI", bg: "#FEEFC3", fg: "#B06000" },
  FAILED_PERMANENT: { label: "AI Unavailable", bg: "#F1F3F4", fg: "#5F6368" },
  UNAVAILABLE: { label: "AI Unavailable", bg: "#F1F3F4", fg: "#5F6368" },
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
          <Text style={styles.addButtonText}>+ Upload</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search records by title or type…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Category Tabs / Folders */}
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
              <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Records List */}
      {records.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading vault documents…</Text>
        </View>
      ) : records.error ? (
        <Text style={styles.error}>{(records.error as Error).message}</Text>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No records in this folder</Text>
          <Text style={styles.emptySub}>
            {searchQuery
              ? "No records matched your search query."
              : "Upload a document, prescription, or lab result to see it here."}
          </Text>
          <Pressable
            onPress={() => router.push("/(patient)/upload")}
            style={({ pressed }) => [styles.uploadEmptyBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.uploadEmptyBtnText}>Upload Medical Document</Text>
          </Pressable>
        </View>
      ) : (
        filteredItems.map((r) => {
          const status = STATUS_STYLE[r.aiStatus] ?? {
            label: r.aiStatus,
            bg: "#F1F3F4",
            fg: "#5F6368",
          };
          return (
            <Pressable
              key={r.id}
              onPress={() => setSelectedRecordId(r.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <View style={[styles.badge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
                </View>
              </View>

              <View style={styles.rowMeta}>
                <Text style={styles.rowSub}>
                  📁 {r.category.replace(/_/g, " ").toLowerCase()} · 📅{" "}
                  {new Date(r.uploadedAt).toLocaleDateString()} · 💾 {formatBytes(r.sizeBytes)}
                </Text>
                <Text style={styles.chevron}>View AI Data ›</Text>
              </View>
            </Pressable>
          );
        })
      )}

      {/* Detail Modal */}
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
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  addButtonText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 13 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchIcon: { fontSize: 14, marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 2, fontSize: 14, color: colors.text },
  clearBtn: { padding: spacing.xs },
  clearBtnText: { color: colors.textMuted, fontSize: 12 },
  categoryScroll: { gap: spacing.sm, paddingBottom: spacing.md },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  categoryTextActive: { color: colors.primaryText },
  loadingBox: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  uploadEmptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
  },
  uploadEmptyBtnText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: "#F9FAFB" },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 14, flex: 1 },
  rowMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  rowSub: { color: colors.textMuted, fontSize: 12 },
  chevron: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
