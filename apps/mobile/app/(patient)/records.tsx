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
import { colors, radius, shadows, spacing } from "../../lib/theme";

const CATEGORIES: Array<{ key: string; label: string; icon: string }> = [
  { key: "ALL", label: "All Folders", icon: "📁" },
  { key: "PRESCRIPTION", label: "Prescriptions", icon: "💊" },
  { key: "LAB_RESULT", label: "Lab Results", icon: "🧪" },
  { key: "IMAGING", label: "Imaging & Scans", icon: "🩻" },
  { key: "DISCHARGE_SUMMARY", label: "Discharge", icon: "📋" },
  { key: "CONSULTATION_NOTE", label: "Doctor Notes", icon: "📝" },
  { key: "VACCINATION", label: "Vaccines", icon: "💉" },
  { key: "OTHER", label: "Other", icon: "📄" },
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
          <Text style={styles.addButtonText}>+ Upload</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search records by title, doctor, or folder…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
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
              <Text style={{ fontSize: 13, marginRight: 4 }}>{c.icon}</Text>
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
          <Text style={{ fontSize: 40, marginBottom: spacing.xs }}>📂</Text>
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
            <Text style={styles.uploadEmptyBtnText}>+ Upload Medical Document</Text>
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
          const catIcon =
            r.category === "PRESCRIPTION"
              ? "💊"
              : r.category === "LAB_RESULT"
              ? "🧪"
              : r.category === "IMAGING"
              ? "🩻"
              : r.category === "DISCHARGE_SUMMARY"
              ? "📋"
              : "📄";

          return (
            <Pressable
              key={r.id}
              onPress={() => setSelectedRecordId(r.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.catIconBox}>
                  <Text style={{ fontSize: 20 }}>{catIcon}</Text>
                </View>
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
                <Text style={styles.cardHint}>Click to view AI extracted clinical data</Text>
                <Text style={styles.inspectBtn}>Inspect AI Data →</Text>
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
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 3,
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
  searchIcon: { fontSize: 14, marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.text },
  clearBtn: { padding: spacing.xs },
  clearBtnText: { color: colors.textMuted, fontSize: 12 },
  categoryScroll: { gap: spacing.xs, paddingBottom: spacing.md },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
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
  categoryTextActive: { color: colors.primaryText, fontWeight: "700" },
  loadingBox: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  uploadEmptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  uploadEmptyBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rowPressed: { backgroundColor: colors.backgroundAlt },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  catIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 15, lineHeight: 20 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardBottomRow: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHint: { fontSize: 11, color: colors.textMuted },
  inspectBtn: { fontSize: 12, fontWeight: "700", color: colors.primary },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
});
