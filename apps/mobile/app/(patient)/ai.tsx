import { useState } from "react";
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
import { ApiError } from "../../lib/api";
import { useMyHealthSummary, usePatientAskAi } from "../../lib/queries";
import { colors, radius, shadows, spacing } from "../../lib/theme";

type ChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  tokens?: { input: number; output: number };
};

const SUGGESTED_PROMPTS = [
  "🧪 Explain my latest lab results in simple terms",
  "💊 Review my active medications and potential side effects",
  "📊 Summarize my medical history and conditions",
  "🩺 What should I ask my doctor at my next appointment?",
];

export default function PatientAiScreen() {
  const [activeTab, setActiveTab] = useState<"chat" | "summary">("chat");
  const [question, setQuestion] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "Hello! I am your MediVault AI Health Assistant. I have secure, encrypted access to your uploaded health records, lab reports, and active medications. How can I help you understand your health today?",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const summary = useMyHealthSummary({ refresh: forceRefresh });
  const askAi = usePatientAskAi();

  async function handleSend(qText?: string) {
    const textToSend = (qText ?? question).trim();
    if (!textToSend || askAi.isPending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");

    try {
      const res = await askAi.mutateAsync({ question: textToSend });
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: res.answer,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        tokens: res.tokens,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Unable to reach the AI engine. Please try again.";
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "ai",
        text: `⚠️ ${msg}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiBadgeCircle}>
            <Text style={styles.aiBadgeEmoji}>🧠</Text>
          </View>
          <View>
            <Text style={styles.title}>AI Health Assistant</Text>
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>Gemini 2.5 Clinical Engine</Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab("chat")}
            style={[styles.tabButton, activeTab === "chat" && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === "chat" && styles.tabTextActive]}>💬 Ask AI</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("summary")}
            style={[styles.tabButton, activeTab === "summary" && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === "summary" && styles.tabTextActive]}>📋 Health Summary</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content Area */}
      {activeTab === "chat" ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <ScrollView
            style={styles.chatScroll}
            contentContainerStyle={styles.chatScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Suggested Prompts */}
            {messages.length <= 1 ? (
              <View style={styles.suggestedContainer}>
                <Text style={styles.suggestedHeading}>SUGGESTED INQUIRIES</Text>
                <View style={styles.promptsGrid}>
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => handleSend(prompt)}
                      style={({ pressed }) => [styles.promptCard, pressed && { opacity: 0.88 }]}
                    >
                      <Text style={styles.promptCardText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Message Stream */}
            {messages.map((m) => {
              const isAi = m.sender === "ai";
              return (
                <View key={m.id} style={[styles.msgRow, isAi ? styles.msgRowAi : styles.msgRowUser]}>
                  {isAi ? (
                    <View style={styles.avatarAi}>
                      <Text style={styles.avatarEmoji}>🧠</Text>
                    </View>
                  ) : null}

                  <View style={[styles.bubble, isAi ? styles.bubbleAi : styles.bubbleUser]}>
                    <Text style={[styles.bubbleText, isAi ? styles.bubbleTextAi : styles.bubbleTextUser]}>
                      {m.text}
                    </Text>

                    <View style={styles.bubbleFooter}>
                      <Text style={[styles.timeText, isAi ? styles.timeTextAi : styles.timeTextUser]}>
                        {m.time}
                      </Text>
                      {m.tokens ? (
                        <Text style={styles.tokenPill}>
                          {m.tokens.input + m.tokens.output} tokens
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}

            {askAi.isPending ? (
              <View style={[styles.msgRow, styles.msgRowAi]}>
                <View style={styles.avatarAi}>
                  <Text style={styles.avatarEmoji}>🧠</Text>
                </View>
                <View style={[styles.bubble, styles.bubbleAi, styles.thinkingBubble]}>
                  <ActivityIndicator color={colors.ai} size="small" />
                  <Text style={styles.thinkingText}>Analyzing your medical records…</Text>
                </View>
              </View>
            ) : null}

            <View style={{ height: spacing.md }} />
          </ScrollView>

          {/* Chat Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about your records, labs, or meds…"
              placeholderTextColor={colors.textMuted}
              style={styles.chatInput}
              multiline
              maxLength={1000}
              editable={!askAi.isPending}
            />
            <Pressable
              onPress={() => handleSend()}
              disabled={!question.trim() || askAi.isPending}
              style={({ pressed }) => [
                styles.sendBtn,
                (!question.trim() || askAi.isPending) && styles.sendBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              {askAi.isPending ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={styles.sendBtnText}>↑</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={styles.summaryScroll} contentContainerStyle={styles.summaryScrollContent}>
          {/* Summary Header Card */}
          <View style={styles.summaryHeroCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryHeroTitle}>Longitudinal Health Overview</Text>
              <Text style={styles.summaryHeroSub}>
                AI-synthesized analysis of all your uploaded diagnostic records, labs, and active medications.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setForceRefresh(true);
                summary.refetch().finally(() => setForceRefresh(false));
              }}
              disabled={summary.isFetching}
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.refreshBtnText}>
                {summary.isFetching ? "Analyzing…" : "↻ Refresh AI"}
              </Text>
            </Pressable>
          </View>

          {summary.isLoading || summary.isFetching ? (
            <View style={styles.summaryLoadingCard}>
              <ActivityIndicator color={colors.ai} size="large" />
              <Text style={styles.summaryLoadingTitle}>Synthesizing Your Clinical Record…</Text>
              <Text style={styles.summaryLoadingSub}>
                Extracting diagnostic trends, lab measurements, and medication profiles using Gemini 2.5.
              </Text>
            </View>
          ) : summary.error ? (
            <View style={styles.summaryErrorCard}>
              <Text style={styles.summaryErrorTitle}>Could Not Generate Summary</Text>
              <Text style={styles.summaryErrorSub}>{(summary.error as Error).message}</Text>
            </View>
          ) : summary.data ? (
            <View>
              {/* Summary Text Card */}
              <View style={styles.summaryContentCard}>
                <Text style={styles.summaryBody}>{summary.data.summaryText}</Text>

                {/* Flags / Alerts */}
                {summary.data.flags && summary.data.flags.length > 0 ? (
                  <View style={styles.flagsSection}>
                    <Text style={styles.flagsHeading}>CLINICAL OBSERVATIONS & ALERTS</Text>
                    {summary.data.flags.map((flag, idx) => (
                      <View key={idx} style={styles.flagItem}>
                        <Text style={styles.flagIcon}>
                          {flag.severity === "high" ? "🚨" : flag.severity === "moderate" ? "⚠️" : "ℹ️"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.flagText}>{flag.text}</Text>
                          <Text style={styles.flagMeta}>
                            {flag.kind.replace(/_/g, " ")} · {flag.severity} priority
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.disclaimerBox}>
                  <Text style={styles.disclaimerText}>
                    🛡️ {summary.data.disclaimer}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  aiBadgeCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: colors.aiLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.aiBorder,
  },
  aiBadgeEmoji: { fontSize: 24 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  modelBadge: {
    backgroundColor: colors.aiLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  modelBadgeText: { fontSize: 10, fontWeight: "700", color: colors.aiDark },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: "800" },
  chatScroll: { flex: 1 },
  chatScrollContent: { padding: spacing.lg, gap: spacing.md },
  suggestedContainer: { marginBottom: spacing.md },
  suggestedHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  promptsGrid: { gap: spacing.xs + 2 },
  promptCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  promptCardText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600", lineHeight: 18 },
  msgRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  msgRowAi: { justifyContent: "flex-start" },
  msgRowUser: { justifyContent: "flex-end" },
  avatarAi: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.aiLight,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarEmoji: { fontSize: 16 },
  bubble: {
    maxWidth: "82%",
    padding: spacing.md,
    borderRadius: radius.xl,
    ...shadows.sm,
  },
  bubbleAi: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAi: { color: colors.text },
  bubbleTextUser: { color: colors.primaryText, fontWeight: "500" },
  bubbleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  timeText: { fontSize: 10 },
  timeTextAi: { color: colors.textMuted },
  timeTextUser: { color: "rgba(255, 255, 255, 0.75)" },
  tokenPill: { fontSize: 9, color: colors.aiDark, backgroundColor: colors.aiLight, paddingHorizontal: 4, borderRadius: radius.xs },
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  thinkingText: { color: colors.aiDark, fontSize: 13, fontWeight: "600" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: colors.primaryText, fontSize: 20, fontWeight: "800" },
  summaryScroll: { flex: 1 },
  summaryScrollContent: { padding: spacing.lg },
  summaryHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
    gap: spacing.md,
  },
  summaryHeroTitle: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  summaryHeroSub: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  refreshBtn: {
    backgroundColor: colors.aiLight,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  refreshBtnText: { color: colors.aiDark, fontWeight: "700", fontSize: 12 },
  summaryLoadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  summaryLoadingTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  summaryLoadingSub: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.xs, lineHeight: 16 },
  summaryErrorCard: {
    backgroundColor: colors.dangerLight,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  summaryErrorTitle: { fontSize: 15, fontWeight: "700", color: colors.danger },
  summaryErrorSub: { fontSize: 12, color: colors.danger, marginTop: 2 },
  summaryContentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  summaryBody: { fontSize: 14, lineHeight: 22, color: colors.text },
  flagsSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  flagsHeading: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, marginBottom: spacing.sm },
  flagItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xs + 2,
    gap: spacing.sm,
  },
  flagIcon: { fontSize: 18 },
  flagText: { fontSize: 13, fontWeight: "600", color: colors.text },
  flagMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1, textTransform: "capitalize" },
  disclaimerBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
  },
  disclaimerText: { fontSize: 11, color: colors.textMuted, lineHeight: 16, textAlign: "center" },
});
