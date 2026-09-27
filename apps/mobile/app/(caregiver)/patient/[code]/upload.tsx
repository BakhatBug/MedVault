import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
import { ApiError } from "../../../../lib/api";
import { colors, radius, shadows, spacing } from "../../../../lib/theme";
import {
  type RecordCategory,
  type UploadInput,
  type UploadProgress,
  uploadRecord,
} from "../../../../lib/upload";

type PickedFile = Pick<UploadInput, "uri" | "mimeType"> & { name: string };

const CATEGORIES: Array<{ value: RecordCategory; label: string; icon: string }> = [
  { value: "PRESCRIPTION", label: "Prescription", icon: "💊" },
  { value: "LAB_RESULT", label: "Lab result", icon: "🧪" },
  { value: "IMAGING", label: "Imaging / Scan", icon: "🩻" },
  { value: "DISCHARGE_SUMMARY", label: "Discharge", icon: "📋" },
  { value: "CONSULTATION_NOTE", label: "Doctor Note", icon: "📝" },
  { value: "VACCINATION", label: "Vaccine", icon: "💉" },
  { value: "INSURANCE", label: "Insurance", icon: "🛡️" },
  { value: "OTHER", label: "Other", icon: "📄" },
];

export default function CaregiverUploadScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code.toUpperCase() : null;

  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RecordCategory>("PRESCRIPTION");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission is required to capture documents.");
      return;
    }
    handleImage(await ImagePicker.launchCameraAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images }));
  }

  async function pickFromLibrary() {
    handleImage(
      await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images }),
    );
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0]!;
    const mime = asset.mimeType ?? "application/pdf";
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
      setError("Unsupported file type. Please upload a PDF, JPG, or PNG document.");
      return;
    }
    setFile({ uri: asset.uri, mimeType: mime as PickedFile["mimeType"], name: asset.name });
    if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ""));
  }

  function handleImage(res: ImagePicker.ImagePickerResult) {
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0]!;
    const mime = (asset.mimeType === "image/png" ? "image/png" : "image/jpeg") as PickedFile["mimeType"];
    setFile({ uri: asset.uri, mimeType: mime, name: asset.fileName ?? `photo-${Date.now()}.jpg` });
    if (!title) setTitle("Medical Photo Record");
  }

  async function onSubmit() {
    setError(null);
    if (!file || !code) {
      setError("Please select a diagnostic document first.");
      return;
    }
    if (!title.trim()) {
      setError("A document title is required.");
      return;
    }
    try {
      setProgress({ phase: "reading" });
      await uploadRecord(
        { uri: file.uri, mimeType: file.mimeType, title: title.trim(), category },
        setProgress,
        code,
      );
      await queryClient.invalidateQueries({ queryKey: ["caregiver", "patient", code, "records"] });
      Alert.alert("Upload Successful", "The document was added to the patient's vault and is being analyzed by AI.", [
        { text: "View Records", onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setProgress(null);
    }
  }

  const submitting = progress !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen
        options={{
          title: `Upload for ${code ?? "Patient"}`,
          headerBackTitle: "Cancel",
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontWeight: "800", fontSize: 16 },
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!file ? (
            <View>
              <View style={styles.introBlock}>
                <Text style={styles.h1}>Upload on Behalf</Text>
                <Text style={styles.sub}>
                  Select a document to store securely in {code}&apos;s medical vault. AI will automatically extract
                  clinical observations and lab values.
                </Text>
              </View>

              <View style={styles.pickerGrid}>
                <Pressable
                  onPress={pickFromCamera}
                  style={({ pressed }) => [styles.pickerCard, pressed && { opacity: 0.92 }]}
                >
                  <View style={[styles.pickerIconCircle, { backgroundColor: "#E0F2FE" }]}>
                    <Text style={styles.pickerEmoji}>📷</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerTitle}>Take Clinical Photo</Text>
                    <Text style={styles.pickerSubtitle}>Capture prescription labels, test kits, or discharge papers</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable
                  onPress={pickFromLibrary}
                  style={({ pressed }) => [styles.pickerCard, pressed && { opacity: 0.92 }]}
                >
                  <View style={[styles.pickerIconCircle, { backgroundColor: "#CCFBF1" }]}>
                    <Text style={styles.pickerEmoji}>🖼️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerTitle}>Choose from Photos</Text>
                    <Text style={styles.pickerSubtitle}>Select scans or photos from photo gallery</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable
                  onPress={pickDocument}
                  style={({ pressed }) => [styles.pickerCard, pressed && { opacity: 0.92 }]}
                >
                  <View style={[styles.pickerIconCircle, { backgroundColor: "#EDE9FE" }]}>
                    <Text style={styles.pickerEmoji}>📄</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerTitle}>Upload PDF Document</Text>
                    <Text style={styles.pickerSubtitle}>Lab reports, discharge summaries, or clinical letters</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              {/* Preview Card */}
              <View style={styles.previewCard}>
                {file.mimeType.startsWith("image/") ? (
                  <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.previewPdf}>
                    <Text style={styles.previewPdfIcon}>📑</Text>
                    <Text style={styles.previewPdfText}>PDF</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {file.name}
                  </Text>
                  <Text style={styles.fileMime}>{file.mimeType}</Text>
                  <Pressable onPress={() => setFile(null)} style={{ marginTop: spacing.xs }}>
                    <Text style={styles.changeLink}>↺ Change file</Text>
                  </Pressable>
                </View>
              </View>

              {/* Title Field */}
              <Text style={styles.fieldLabel}>DOCUMENT TITLE</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Blood Test CBC Panel, Dr. Visit Note"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />

              {/* Category Chips */}
              <Text style={styles.fieldLabel}>DOCUMENT CATEGORY</Text>
              <View style={styles.chipsGrid}>
                {CATEGORIES.map((c) => {
                  const selected = c.value === category;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      disabled={submitting}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={styles.chipIcon}>{c.icon}</Text>
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
              ) : null}

              {progress ? (
                <View style={styles.progressCard}>
                  <ActivityIndicator color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.progressTitle}>Uploading & Encrypting…</Text>
                    <Text style={styles.progressText}>{progressLabel(progress)}</Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && !submitting && { opacity: 0.88 },
                  submitting && { opacity: 0.6 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.submitBtnText}>Upload to Vault</Text>
                )}
              </Pressable>
            </View>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function progressLabel(p: UploadProgress): string {
  switch (p.phase) {
    case "reading":
      return "Reading file stream…";
    case "hashing":
      return "Calculating SHA-256 integrity hash…";
    case "presigning":
      return "Authorizing secure S3 vault URL…";
    case "uploading":
      return `Streaming to vault… ${Math.round(p.pct * 100)}%`;
    case "confirming":
      return "Finalizing encryption & queueing AI extractor…";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  introBlock: { marginBottom: spacing.lg },
  h1: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
  pickerGrid: { gap: spacing.md },
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    gap: spacing.md,
  },
  pickerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmoji: { fontSize: 22 },
  pickerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickerSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 20, color: colors.textMuted },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadows.sm,
    gap: spacing.md,
  },
  previewImage: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  previewPdf: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  previewPdfIcon: { fontSize: 24 },
  previewPdfText: { fontSize: 10, fontWeight: "800", color: colors.primaryDark, marginTop: 2 },
  fileName: { fontSize: 14, fontWeight: "700", color: colors.text },
  fileMime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  changeLink: { fontSize: 12, fontWeight: "700", color: colors.primary },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs + 2,
    marginLeft: 2,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipIcon: { fontSize: 13 },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: colors.primaryText, fontWeight: "700" },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  progressTitle: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
  progressText: { fontSize: 11, color: colors.primaryDark, marginTop: 2 },
  submitBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  submitBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
});

