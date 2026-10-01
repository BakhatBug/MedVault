import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAskAi } from "../../../../lib/queries";
import { colors, radius, shadows, spacing } from "../../../../lib/theme";

type QaEntry = {
  id: string;
  question: string;
  answer?: string;
  model?: string;
  tokens?: { input: number; output: number };
  error?: string;
  generatedAt?: string;
};

const SUGGESTED_QUESTIONS = [
  "Summarize all active medications and dosages.",
  "What chronic conditions or diagnoses are on record?",
  "Show the latest lab test readings and abnormal values.",
  "Are there any recorded allergies or drug contraindications?",
];

export default function AskAiScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code.toUpperCase() : null;
  const ask = useAskAi();
  const scrollRef = useRef<ScrollView | null>(null);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QaEntry[]>([]);

  const canSubmit = !!code && question.trim().length >= 3 && !ask.isPending;

  async function handleSendQuestion(qText: string) {
    if (!code || ask.isPending) return;
    const q = qText.trim();
    if (q.length < 3) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setQuestion("");
    setHistory((h) => [...h, { id, question: q }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await ask.mutateAsync({ patientCode: code, question: q });
      setHistory((h) =>
        h.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                answer: res.answer,
                model: res.modelId,
                tokens: res.tokens,
                generatedAt: res.generatedAt,
              }
            : entry,
        ),
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not get an answer from AI.";
      setHistory((h) => h.map((entry) => (entry.id === id ? { ...entry, error: msg } : entry)));
    } finally {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: `AI Clinical Assistant · ${code ?? ""}` }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Welcome Hint Card */}
          <View style={styles.hintCard}>
            <View style={styles.hintCardHead}>
              <LinearGradient
                colors={[colors.ai, colors.aiDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sparkIconBox}
              >
                <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.hintTitle}>AI Clinical Assistant</Text>
                <Text style={styles.hintSub}>Grounded on verified FHIR clinical records for {code}</Text>
              </View>
            </View>
            <Text style={styles.hintBody}>
              Ask direct clinical inquiries. The AI extracts answers strictly from verified prescriptions, diagnostic
              reports, lab observations, and conditions.
            </Text>

            <Text style={styles.hintSectionTitle}>Quick Inquiries:</Text>
            <View style={styles.chipContainer}>
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => void handleSendQuestion(q)}
                  disabled={ask.isPending}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Ionicons name="bulb-outline" size={14} color={colors.aiDark} style={{ marginRight: 6 }} />
                  <Text style={styles.chipText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Conversation Exchange */}
          {history.map((e) => (
            <View key={e.id} style={styles.exchange}>
              {/* Doctor Question */}
              <View style={styles.questionBubble}>
                <View style={styles.questionRoleRow}>
                  <MaterialCommunityIcons name="doctor" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.questionRole}>Clinician Inquiry</Text>
                </View>
                <Text style={styles.questionText}>{e.question}</Text>
              </View>

              {/* AI Answer Card */}
              {e.error ? (
                <View style={styles.errorBubble}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} style={{ marginRight: 4 }} />
                  <Text style={styles.errorText}>{e.error}</Text>
                </View>
              ) : e.answer ? (
                <View style={styles.answerBubble}>
                  <View style={styles.answerHeader}>
                    <View style={styles.aiTag}>
                      <Ionicons name="sparkles" size={14} color={colors.ai} style={{ marginRight: 4 }} />
                      <Text style={styles.aiLabel}>MediVault Clinical AI</Text>
                    </View>
                    {e.model ? <Text style={styles.modelTag}>{e.model}</Text> : null}
                  </View>
                  <Text style={styles.answerText}>{e.answer}</Text>
                  <View style={styles.answerFooter}>
                    <Text style={styles.disclaimerText}>
                      AI-generated decision support — verify with source diagnostic reports.
                    </Text>
                    {e.tokens ? (
                      <Text style={styles.answerMeta}>
                        Tokens: {e.tokens.input} prompt · {e.tokens.output} completion
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.loadingBubble}>
                  <ActivityIndicator color={colors.ai} size="small" />
                  <Text style={styles.loadingText}>Analyzing extracted clinical records…</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Input Composer */}
        <View style={styles.composer}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask anything about this patient's medical records…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            editable={!ask.isPending}
            onSubmitEditing={() => void handleSendQuestion(question)}
          />
          <Pressable
            onPress={() => void handleSendQuestion(question)}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSubmit && { opacity: 0.5 },
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            {ask.isPending ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.sendText}>Ask AI</Text>
                <Ionicons name="send" size={13} color="#FFFFFF" />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  hintCard: {
    backgroundColor: colors.aiLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    gap: spacing.sm,
    ...shadows.sm,
  },
  hintCardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sparkIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  hintTitle: { color: colors.aiDark, fontWeight: "800", fontSize: 16 },
  hintSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  hintBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  hintSectionTitle: { color: colors.text, fontWeight: "700", fontSize: 12, marginTop: spacing.xs },
  chipContainer: { gap: spacing.xs, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
  },
  chipPressed: { backgroundColor: colors.backgroundAlt },
  chipText: { fontSize: 13, color: colors.aiDark, fontWeight: "600", flex: 1 },
  exchange: { gap: spacing.md },
  questionBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primaryDeep,
    borderRadius: radius.xl,
    borderBottomRightRadius: radius.xs,
    padding: spacing.md + 2,
    maxWidth: "88%",
    ...shadows.sm,
  },
  questionRoleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  questionRole: { fontSize: 11, color: "rgba(255, 255, 255, 0.85)", fontWeight: "700" },
  questionText: { color: colors.primaryText, fontSize: 14, fontWeight: "500", lineHeight: 20 },
  answerBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderBottomLeftRadius: radius.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    maxWidth: "94%",
    gap: spacing.sm,
    ...shadows.sm,
  },
  answerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  aiTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  aiLabel: { fontSize: 12, fontWeight: "800", color: colors.aiDark },
  modelTag: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  answerText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  answerFooter: { borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.xs, gap: 2 },
  disclaimerText: { fontSize: 10, color: colors.textMuted, fontStyle: "italic" },
  answerMeta: { color: colors.textMuted, fontSize: 10 },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.aiLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    alignSelf: "flex-start",
  },
  loadingText: { color: colors.aiDark, fontSize: 13, fontWeight: "600" },
  errorBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.dangerLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    maxWidth: "90%",
  },
  errorText: { color: colors.dangerText, fontSize: 13, fontWeight: "600" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
    ...shadows.md,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    backgroundColor: colors.ai,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  sendText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
});
