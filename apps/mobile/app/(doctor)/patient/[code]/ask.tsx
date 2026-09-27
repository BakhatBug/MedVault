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
import { colors, radius, spacing } from "../../../../lib/theme";

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
      <Stack.Screen options={{ title: `Ask AI · ${code ?? ""}` }} />
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
              <Text style={styles.aiSpark}>✨</Text>
              <Text style={styles.hintTitle}>AI Clinical Assistant</Text>
            </View>
            <Text style={styles.hintBody}>
              This AI is strictly grounded on {code}&apos;s verified medical records, prescriptions, lab tests, and
              allergies.
            </Text>

            <Text style={styles.hintSectionTitle}>Quick Clinical Questions:</Text>
            <View style={styles.chipContainer}>
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => void handleSendQuestion(q)}
                  disabled={ask.isPending}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>💡 {q}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Conversation History */}
          {history.map((e) => (
            <View key={e.id} style={styles.exchange}>
              {/* Doctor question */}
              <View style={styles.questionBubble}>
                <Text style={styles.questionRole}>Doctor Query</Text>
                <Text style={styles.questionText}>{e.question}</Text>
              </View>

              {/* AI Answer */}
              {e.error ? (
                <View style={styles.errorBubble}>
                  <Text style={styles.errorText}>⚠️ {e.error}</Text>
                </View>
              ) : e.answer ? (
                <View style={styles.answerBubble}>
                  <View style={styles.answerHeader}>
                    <Text style={styles.aiLabel}>✨ MediVault AI</Text>
                    {e.model ? <Text style={styles.modelTag}>{e.model}</Text> : null}
                  </View>
                  <Text style={styles.answerText}>{e.answer}</Text>
                  <Text style={styles.disclaimerText}>
                    AI-generated clinical response — verify with source diagnostic reports.
                  </Text>
                  {e.tokens ? (
                    <Text style={styles.answerMeta}>
                      Tokens: {e.tokens.input} prompt · {e.tokens.output} response
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.answerBubble}>
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.loadingText}>Analyzing extracted clinical records…</Text>
                  </View>
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
            placeholder="Ask a question about this patient's records…"
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
              <Text style={styles.sendText}>Ask AI</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  hintCard: {
    backgroundColor: "#F4F7FB",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#D3E3FD",
    gap: spacing.sm,
  },
  hintCardHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  aiSpark: { fontSize: 18 },
  hintTitle: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  hintBody: { color: colors.text, fontSize: 13, lineHeight: 18 },
  hintSectionTitle: { color: colors.text, fontWeight: "700", fontSize: 12, marginTop: spacing.xs },
  chipContainer: { gap: spacing.xs, marginTop: 2 },
  chip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#B7D2F5",
  },
  chipPressed: { backgroundColor: "#E8F0FE" },
  chipText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  exchange: { gap: spacing.sm },
  questionBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderBottomRightRadius: 2,
    padding: spacing.md,
    maxWidth: "88%",
  },
  questionRole: { fontSize: 10, color: "rgba(255, 255, 255, 0.8)", fontWeight: "700", marginBottom: 2 },
  questionText: { color: colors.primaryText, fontSize: 14, fontWeight: "500" },
  answerBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 2,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "92%",
    gap: spacing.xs,
  },
  answerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  aiLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  modelTag: { fontSize: 10, color: colors.textMuted, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  answerText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  disclaimerText: { fontSize: 10, color: colors.textMuted, fontStyle: "italic", marginTop: 4 },
  answerMeta: { color: colors.textMuted, fontSize: 10 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  errorBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FBEAEA",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#F5C2C7",
    maxWidth: "90%",
  },
  errorText: { color: colors.danger, fontSize: 13 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: colors.primaryText, fontWeight: "700", fontSize: 14 },
});
