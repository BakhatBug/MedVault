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
import { colors, radius, spacing } from "../../../../lib/theme";
import {
  type RecordCategory,
  type UploadInput,
  type UploadProgress,
  uploadRecord,
} from "../../../../lib/upload";

type PickedFile = Pick<UploadInput, "uri" | "mimeType"> & { name: string };

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

// Caregiver uploads a document on behalf of a linked patient. Routes through
// uploadRecord() with the patient code, which targets the /caregivers/... API.
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
      setError("Camera permission denied.");
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
      setError("Unsupported file type. Use PDF, JPG, or PNG.");
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
    if (!title) setTitle("Captured photo");
  }

  async function onSubmit() {
    setError(null);
    if (!file || !code) {
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
        { uri: file.uri, mimeType: file.mimeType, title: title.trim(), category },
        setProgress,
        code, // ← on-behalf-of: routes to /caregivers/patients/:code/records/*
      );
      await queryClient.invalidateQueries({ queryKey: ["caregiver", "patient", code, "records"] });
      Alert.alert("Uploaded", "The document was added to the patient's vault and is being processed.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  const submitting = progress !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Upload for patient", headerBackTitle: "Cancel" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!file ? (
            <View style={styles.pickerCard}>
              <Text style={styles.h1}>Add a document</Text>
              <Text style={styles.sub}>Uploading on behalf of {code}.</Text>
              <PickerButton label="Take photo" onPress={pickFromCamera} />
              <PickerButton label="Choose from photos" onPress={pickFromLibrary} />
              <PickerButton label="Pick a file (PDF / image)" onPress={pickDocument} />
            </View>
          ) : (
            <>
              <View style={styles.previewCard}>
                {file.mimeType.startsWith("image/") ? (
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
                  <Pressable onPress={() => setFile(null)}>
                    <Text style={styles.changeLink}>Pick a different file</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.label}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Visit summary"
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
  previewImage: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.background },
  previewPdf: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: "#E1ECF1",
    justifyContent: "center",
    alignItems: "center",
  },
  previewPdfText: { color: colors.primary, fontWeight: "700", letterSpacing: 1 },
  fileName: { color: colors.text, fontWeight: "600", fontSize: 14 },
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
