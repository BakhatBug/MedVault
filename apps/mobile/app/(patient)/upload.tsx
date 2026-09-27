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
import { colors, radius, spacing } from "../../lib/theme";
import {
  type RecordCategory,
  type UploadInput,
  type UploadProgress,
  uploadRecord,
} from "../../lib/upload";

type PickedFile = Pick<UploadInput, "uri" | "mimeType"> & { name: string; sizeBytes?: number };

const CATEGORIES: Array<{ value: RecordCategory; label: string }> = [
  { value: "PRESCRIPTION", label: "Prescription" },
  { value: "LAB_RESULT", label: "Lab result" },
  { value: "IMAGING", label: "Imaging" },
  { value: "DISCHARGE_SUMMARY", label: "Discharge" },
  { value: "CONSULTATION_NOTE", label: "Note" },
  { value: "VACCINATION", label: "Vaccine" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "OTHER", label: "Other" },
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
      setError("Camera permission denied.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
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
      setError("Unsupported file type. Use PDF, JPG, or PNG.");
      return;
    }
    setFile({ uri: asset.uri, mimeType: mime, name: asset.name, sizeBytes: asset.size ?? undefined });
    if (!title) setTitle(stripExtension(asset.name));
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
    if (!title) setTitle("Captured photo");
  }

  async function onSubmit() {
    setError(null);
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
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
      // Invalidate so Records / Home / Timeline pick up the new row.
      await queryClient.invalidateQueries({ queryKey: ["records"] });
      await queryClient.invalidateQueries({ queryKey: ["timeline"] });
      // Meds + interactions may also change once extraction completes; refresh
      // optimistically — it's cheap.
      await queryClient.invalidateQueries({ queryKey: ["medications"] });
      await queryClient.invalidateQueries({ queryKey: ["interactions"] });

      Alert.alert(
        "Uploaded",
        "Your document is being processed. The AI will populate medications and timeline events automatically.",
        [{ text: "OK", onPress: () => router.back() }],
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
      <Stack.Screen options={{ title: "Add to vault", headerBackTitle: "Cancel" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!file ? (
            <View style={styles.pickerCard}>
              <Text style={styles.h1}>Add a document</Text>
              <Text style={styles.sub}>
                Photograph, scan, or attach a prescription, lab result, or any medical record. The AI extracts the
                details automatically.
              </Text>
              <PickerButton label="Take photo" onPress={pickFromCamera} />
              <PickerButton label="Choose from photos" onPress={pickFromLibrary} />
              <PickerButton label="Pick a file (PDF / image)" onPress={pickDocument} />
            </View>
          ) : (
            <>
              <View style={styles.previewCard}>
                {isImage(file.mimeType) ? (
                  <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.previewPdf}>
                    <Text style={styles.previewPdfText}>PDF</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {file.name}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {file.mimeType}
                    {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ""}
                  </Text>
                  <Pressable onPress={() => setFile(null)}>
                    <Text style={styles.changeLink}>Pick a different file</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.label}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Visit with Dr. Chen — 2026-05-08"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                  const selected = c.value === category;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      disabled={submitting}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything to remember about this record."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.notes]}
                multiline
                numberOfLines={3}
                editable={!submitting}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {progress ? (
                <View style={styles.progressBlock}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.progressText}>{progressLabel(progress)}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.submit,
                  pressed && !submitting && { opacity: 0.85 },
                  submitting && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.submitText}>{submitting ? "Uploading…" : "Upload"}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PickerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pickerButton, pressed && { opacity: 0.85 }]}>
      <Text style={styles.pickerButtonText}>{label}</Text>
    </Pressable>
  );
}

function progressLabel(p: UploadProgress): string {
  switch (p.phase) {
    case "reading":
      return "Reading file…";
    case "hashing":
      return "Verifying integrity…";
    case "presigning":
      return "Requesting upload URL…";
    case "uploading":
      return `Uploading… ${Math.round(p.pct * 100)}%`;
    case "confirming":
      return "Finalizing…";
  }
}

function isImage(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png";
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.lg },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  pickerButton: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerButtonText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImage: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.background },
  previewPdf: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: "#E1ECF1",
    justifyContent: "center",
    alignItems: "center",
  },
  previewPdfText: { color: colors.primary, fontWeight: "700", letterSpacing: 1 },
  fileName: { color: colors.text, fontWeight: "600", fontSize: 14 },
  fileMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  changeLink: { color: colors.primary, fontSize: 12, marginTop: spacing.sm, fontWeight: "600" },
  label: { color: colors.text, fontSize: 13, fontWeight: "600", marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  notes: { minHeight: 80, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "500" },
  chipTextSelected: { color: colors.primaryText },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md },
  progressBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#E1ECF1",
    borderRadius: radius.md,
  },
  progressText: { color: colors.text, fontSize: 13 },
  submit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
  },
  submitText: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
});
