import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../lib/api";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import {
  type RecordCategory,
  type UploadInput,
  type UploadProgress,
  uploadRecord,
} from "../../lib/upload";

type PickedFile = Pick<UploadInput, "uri" | "mimeType"> & { name: string; sizeBytes?: number };

const CATEGORIES: Array<{ value: RecordCategory; label: string; icon: string }> = [
  { value: "PRESCRIPTION", label: "Prescription", icon: "💊" },
  { value: "LAB_RESULT", label: "Lab Result", icon: "🧪" },
  { value: "IMAGING", label: "Imaging & Scans", icon: "🩻" },
  { value: "DISCHARGE_SUMMARY", label: "Discharge", icon: "📋" },
  { value: "CONSULTATION_NOTE", label: "Doctor Note", icon: "📝" },
  { value: "VACCINATION", label: "Vaccine", icon: "💉" },
  { value: "INSURANCE", label: "Insurance", icon: "🛡️" },
  { value: "OTHER", label: "Other Record", icon: "📄" },
];

export default function UploadScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RecordCategory>("PRESCRIPTION");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission is required to capture documents.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    handleImagePickerResult(res);
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    handleImagePickerResult(res);
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) return;
    const asset = res.assets[0]!;
    const mime = (asset.mimeType ?? guessMime(asset.name)) as PickedFile["mimeType"] | undefined;
    if (!mime || !["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
      setError("Unsupported file type. Please attach a PDF, JPG, or PNG document.");
      return;
    }
    setFile({ uri: asset.uri, mimeType: mime, name: asset.name, sizeBytes: asset.size ?? undefined });
    if (!title) setTitle(stripExtension(asset.name));
    setError(null);
  }

  function handleImagePickerResult(res: ImagePicker.ImagePickerResult) {
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0]!;
    const mime = (asset.mimeType ?? "image/jpeg") as PickedFile["mimeType"];
    setFile({
      uri: asset.uri,
      mimeType: mime === "image/png" ? "image/png" : "image/jpeg",
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      ...(asset.fileSize !== undefined ? { sizeBytes: asset.fileSize } : {}),
    });
    if (!title) setTitle("Medical photo " + new Date().toLocaleDateString());
    setError(null);
  }

  async function onSubmit() {
    setError(null);
    if (!file) {
      setError("Please select or photograph a medical document first.");
      return;
    }
    if (!title.trim()) {
      setError("Document title is required.");
      return;
    }
    try {
      setProgress({ phase: "reading" });
      await uploadRecord(
        {
          uri: file.uri,
          mimeType: file.mimeType,
          title: title.trim(),
          category,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        setProgress,
      );
      await queryClient.invalidateQueries({ queryKey: ["records"] });
      await queryClient.invalidateQueries({ queryKey: ["timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["medications"] });
      await queryClient.invalidateQueries({ queryKey: ["interactions"] });

      Alert.alert(
        "Upload Complete",
        "Your document has been securely encrypted and stored. The AI extraction pipeline is now processing clinical entities.",
        [{ text: "View Vault", onPress: () => router.back() }],
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed.";
      setError(msg);
    } finally {
      setProgress(null);
    }
  }

  const submitting = progress !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Upload to Vault", headerBackTitle: "Cancel" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!file ? (
            <View style={styles.pickerCard}>
              <View style={styles.pickerHeader}>
                <Text style={{ fontSize: 32 }}>📤</Text>
                <Text style={styles.h1}>Upload Medical Record</Text>
                <Text style={styles.sub}>
                  Photograph or attach prescriptions, lab results, discharge summaries, or imaging scans. The AI
                  automatically extracts medications and clinical entities.
                </Text>
              </View>

              <View style={styles.pickerActions}>
                <PickerOption
                  icon="📸"
                  title="Take Photo with Camera"
                  desc="Capture physical prescription or lab printout"
                  onPress={pickFromCamera}
                />
                <PickerOption
                  icon="🖼️"
                  title="Choose from Photo Library"
                  desc="Select photo from camera roll"
                  onPress={pickFromLibrary}
                />
                <PickerOption
                  icon="📄"
                  title="Pick PDF / Document File"
                  desc="Upload digital lab results or PDF reports"
                  onPress={pickDocument}
                />
              </View>
            </View>
          ) : (
            <View style={styles.formCard}>
              {/* Selected File Preview */}
              <View style={styles.previewCard}>
                {isImage(file.mimeType) ? (
                  <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.previewPdf}>
                    <Text style={{ fontSize: 24 }}>📄</Text>
                    <Text style={styles.previewPdfText}>PDF</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {file.name}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {file.mimeType}
                    {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ""}
                  </Text>
                  <Pressable onPress={() => setFile(null)} style={styles.changeLinkBtn}>
                    <Text style={styles.changeLink}>Change document</Text>
                  </Pressable>
                </View>
              </View>

              {/* Title Input */}
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.label}>Document Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Lab Report - Lipid Panel - Dr. Chen"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  editable={!submitting}
                />
              </View>

              {/* Category Selector */}
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Document Category</Text>
                <View style={styles.chips}>
                  {CATEGORIES.map((c) => {
                    const selected = c.value === category;
                    return (
                      <Pressable
                        key={c.value}
                        onPress={() => setCategory(c.value)}
                        style={[styles.chip, selected && styles.chipActive]}
                      >
                        <Text style={{ fontSize: 13, marginRight: 4 }}>{c.icon}</Text>
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Optional Notes */}
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Doctor or Clinic Notes (Optional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Routine 6-month checkup, follow-up in 2 weeks"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.notesInput]}
                  multiline
                  numberOfLines={2}
                  editable={!submitting}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* Progress State */}
              {progress ? (
                <View style={styles.progressCard}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.progressText}>
                    {progress.phase === "reading"
                      ? "Reading file…"
                      : progress.phase === "hashing"
                      ? "Computing SHA-256 integrity hash…"
                      : progress.phase === "presigning"
                      ? "Authorizing encrypted storage…"
                      : progress.phase === "uploading"
                      ? `Uploading file (${progress.pct ?? 0}%)…`
                      : "Triggering AI FHIR extraction…"}
                  </Text>
                </View>
              ) : null}

              {/* Submit Button */}
              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.submitButton,
                  submitting && { opacity: 0.6 },
                  pressed && !submitting && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? "Uploading & Extracting…" : "Encrypt & Save to Vault"}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PickerOption({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: string;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pickerOption, pressed && styles.pickerOptionPressed]}>
      <View style={styles.pickerOptionIconBox}>
        <Text style={{ fontSize: 24 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerOptionTitle}>{title}</Text>
        <Text style={styles.pickerOptionDesc}>{desc}</Text>
      </View>
      <Text style={styles.pickerOptionChevron}>›</Text>
    </Pressable>
  );
}

function isImage(m: string): boolean {
  return m === "image/jpeg" || m === "image/png";
}

function guessMime(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return undefined;
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  pickerHeader: { alignItems: "center", marginBottom: spacing.xl },
  h1: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: spacing.xs },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4, lineHeight: 18 },
  pickerActions: { gap: spacing.sm },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  pickerOptionPressed: { backgroundColor: colors.backgroundAlt },
  pickerOptionIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerOptionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickerOptionDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pickerOptionChevron: { fontSize: 22, color: colors.textMuted },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  previewImage: { width: 64, height: 64, borderRadius: radius.lg },
  previewPdf: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  previewPdfText: { fontSize: 11, fontWeight: "800", color: colors.dangerText, marginTop: 2 },
  fileName: { fontSize: 14, fontWeight: "700", color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  changeLinkBtn: { marginTop: 4 },
  changeLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  notesInput: { minHeight: 56, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.primaryText, fontWeight: "700" },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  progressText: { fontSize: 13, color: colors.primaryDark, fontWeight: "600" },
  submitButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  submitButtonText: { color: colors.primaryText, fontWeight: "800", fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, fontWeight: "600" },
});
