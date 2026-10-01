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
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { ApiError } from "../../lib/api";
import { colors, radius, shadows, spacing } from "../../lib/theme";
import {
  type RecordCategory,
  type UploadInput,
  type UploadProgress,
  uploadRecord,
} from "../../lib/upload";

type PickedFile = Pick<UploadInput, "uri" | "mimeType"> & { name: string; sizeBytes?: number };

type CategoryOption = {
  value: RecordCategory;
  label: string;
  family: "ionicons" | "material";
  icon: any;
};

const CATEGORIES: CategoryOption[] = [
  { value: "PRESCRIPTION", label: "Prescription", family: "material", icon: "pill" },
  { value: "LAB_RESULT", label: "Lab Result", family: "material", icon: "flask-outline" },
  { value: "IMAGING", label: "Imaging & Scans", family: "material", icon: "radiology-box-outline" },
  { value: "DISCHARGE_SUMMARY", label: "Discharge", family: "material", icon: "clipboard-pulse-outline" },
  { value: "CONSULTATION_NOTE", label: "Doctor Note", family: "ionicons", icon: "document-text-outline" },
  { value: "VACCINATION", label: "Vaccine", family: "material", icon: "needle" },
  { value: "INSURANCE", label: "Insurance", family: "ionicons", icon: "shield-checkmark-outline" },
  { value: "OTHER", label: "Other Record", family: "ionicons", icon: "document-outline" },
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
      <Stack.Screen options={{ title: "Upload Record", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header Description */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Medical Document</Text>
            <Text style={styles.subtitle}>
              Secure zero-knowledge upload with automated AI OCR and FHIR clinical resource extraction.
            </Text>
          </View>

          {/* AI Banner */}
          <View style={styles.aiBanner}>
            <Ionicons name="sparkles" size={16} color={colors.aiDark} />
            <Text style={styles.aiBannerText}>
              All documents are automatically scanned for medications, conditions, and lab values.
            </Text>
          </View>

          {!file ? (
            /* File Picker Options */
            <View style={styles.pickerCard}>
              <Text style={styles.pickerHeading}>SELECT ATTACHMENT METHOD</Text>

              <PickerOption
                icon={<Ionicons name="camera-outline" size={24} color={colors.primary} />}
                title="Photograph Document"
                desc="Capture prescription, bill, or clinic printout with camera"
                onPress={pickFromCamera}
              />
              <View style={styles.divider} />

              <PickerOption
                icon={<Ionicons name="images-outline" size={24} color="#2563EB" />}
                title="Choose from Photo Library"
                desc="Select medical photo or screenshot from your device"
                onPress={pickFromLibrary}
              />
              <View style={styles.divider} />

              <PickerOption
                icon={<Ionicons name="document-attach-outline" size={24} color="#7C3AED" />}
                title="Attach PDF or Digital File"
                desc="Browse PDF lab results, discharge letters, or diagnostic reports"
                onPress={pickDocument}
              />
            </View>
          ) : (
            /* File Metadata Form */
            <View>
              {/* Selected File Card */}
              <View style={styles.fileCard}>
                {isImage(file.mimeType) ? (
                  <Image source={{ uri: file.uri }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.pdfThumbnail}>
                    <Ionicons name="document-text" size={24} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>
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
                        {c.family === "material" ? (
                          <MaterialCommunityIcons
                            name={c.icon}
                            size={14}
                            color={selected ? colors.surface : colors.textSecondary}
                            style={{ marginRight: 4 }}
                          />
                        ) : (
                          <Ionicons
                            name={c.icon}
                            size={14}
                            color={selected ? colors.surface : colors.textSecondary}
                            style={{ marginRight: 4 }}
                          />
                        )}
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
                <Ionicons name="lock-closed" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
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
  icon: React.ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pickerOption, pressed && styles.pickerOptionPressed]}>
      <View style={styles.pickerOptionIconBox}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerOptionTitle}>{title}</Text>
        <Text style={styles.pickerOptionDesc}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
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
  header: { marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13, lineHeight: 18 },
  aiBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.aiLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    marginBottom: spacing.lg,
  },
  aiBannerText: { fontSize: 12, color: colors.aiDark, fontWeight: "600", flex: 1, lineHeight: 17 },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pickerHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pickerOptionPressed: { opacity: 0.8 },
  pickerOptionIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerOptionTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  pickerOptionDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderLight },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  thumbnail: { width: 56, height: 56, borderRadius: radius.md },
  pdfThumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 14, fontWeight: "700", color: colors.text },
  fileMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  changeLinkBtn: { marginTop: 4 },
  changeLink: { fontSize: 12, color: colors.primaryDark, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.primaryText, fontWeight: "700" },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  progressText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
  submitButton: {
    flexDirection: "row",
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  submitButtonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
  error: { color: colors.danger, marginTop: spacing.md, fontSize: 13 },
});
