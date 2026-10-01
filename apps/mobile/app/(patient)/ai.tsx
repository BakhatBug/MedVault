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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
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
  {
    icon: "flask-outline",
    family: "material",
    text: "Explain my latest lab results in simple terms",
  },
  {
    icon: "pill",
    family: "material",
    text: "Review my active medications and potential side effects",
  },
  {
    icon: "pulse-outline",
    family: "ionicons",
    text: "Summarize my medical history and conditions",
  },
  {
    icon: "help-circle-outline",
    family: "ionicons",
    text: "What should I ask my doctor at my next appointment?",
  },
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
        text: msg,
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
          <LinearGradient
            colors={["#6366F1", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiBadgeCircle}
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </LinearGradient>
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
            <Ionicons
              name={activeTab === "chat" ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
              size={15}
              color={activeTab === "chat" ? colors.aiDark : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "chat" && styles.tabTextActive]}>Ask AI</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("summary")}
            style={[styles.tabButton, activeTab === "summary" && styles.tabButtonActive]}
          >
            <Ionicons
              name={activeTab === "summary" ? "document-text" : "document-text-outline"}
              size={15}
              color={activeTab === "summary" ? colors.aiDark : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === "summary" && styles.tabTextActive]}>Summary</Text>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.sm }}>
                  <Ionicons name="bulb-outline" size={14} color={colors.aiDark} />
                  <Text style={styles.suggestedHeading}>SUGGESTED INQUIRIES</Text>
                </View>
                <View style={styles.promptsGrid}>
                  {SUGGESTED_PROMPTS.map((p, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => handleSend(p.text)}
                      style={({ pressed }) => [styles.promptCard, pressed && { opacity: 0.88 }]}
                    >
                      <View style={styles.promptIconBox}>
                        {p.family === "material" ? (
                          <MaterialCommunityIcons name={p.icon as any} size={16} color={colors.aiDark} />
                        ) : (
                          <Ionicons name={p.icon as any} size={16} color={colors.aiDark} />
                        )}
                      </View>
                      <Text style={styles.promptCardText}>{p.text}</Text>
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
                    <LinearGradient
                      colors={["#6366F1", "#4F46E5"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarAi}
                    >
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                    </LinearGradient>
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
                <LinearGradient
                  colors={["#6366F1", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarAi}
                >
                  <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                </LinearGradient>
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
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
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
              <Ionicons
                name="refresh"
                size={14}
                color={colors.aiDark}
                style={summary.isFetching ? { transform: [{ rotate: "45deg" }] } : undefined}
              />
              <Text style={styles.refreshBtnText}>
                {summary.isFetching ? "Analyzing…" : "Refresh"}
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
              <Ionicons name="alert-circle-outline" size={32} color={colors.danger} style={{ marginBottom: spacing.xs }} />
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
                        <View style={styles.flagIconBox}>
                          {flag.severity === "high" ? (
                            <Ionicons name="alert-circle" size={20} color={colors.danger} />
                          ) : flag.severity === "moderate" ? (
                            <Ionicons name="warning" size={19} color={colors.warning} />
                          ) : (
                            <Ionicons name="information-circle" size={19} color={colors.info} />
                          )}
                        </View>
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
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.disclaimerText}>
                    {summary.data.disclaimer}
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
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  modelBadge: {
    backgroundColor: colors.aiLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  modelBadgeText: { fontSize: 10, fontWeight: "700", color: colors.aiDark },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.lg,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: colors.aiDark, fontWeight: "700" },
  chatScroll: { flex: 1 },
  chatScrollContent: { padding: spacing.md },
  suggestedContainer: { marginBottom: spacing.md },
  suggestedHeading: { fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5 },
  promptsGrid: { gap: spacing.xs + 2, marginTop: 4 },
  promptCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  promptIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.aiLight,
    alignItems: "center",
    justifyContent: "center",
  },
  promptCardText: { fontSize: 13, fontWeight: "600", color: colors.text, flex: 1 },
  msgRow: { flexDirection: "row", marginBottom: spacing.md, gap: spacing.sm, alignItems: "flex-end" },
  msgRowAi: { justifyContent: "flex-start" },
  msgRowUser: { justifyContent: "flex-end" },
  avatarAi: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { maxWidth: "82%", borderRadius: radius.xl, padding: spacing.md, ...shadows.sm },
  bubbleAi: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.xs,
  },
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.aiLight,
    borderColor: colors.aiBorder,
  },
  thinkingText: { fontSize: 13, color: colors.aiDark, fontWeight: "600" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAi: { color: colors.text },
  bubbleTextUser: { color: colors.primaryText, fontWeight: "500" },
  bubbleFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4, gap: spacing.sm },
  timeText: { fontSize: 10 },
  timeTextAi: { color: colors.textMuted },
  timeTextUser: { color: "rgba(255, 255, 255, 0.75)" },
  tokenPill: {
    fontSize: 9,
    color: colors.aiDark,
    backgroundColor: colors.aiLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
    fontWeight: "700",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ai,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  summaryScroll: { flex: 1 },
  summaryScrollContent: { padding: spacing.md },
  summaryHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  summaryHeroTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  summaryHeroSub: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.aiLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.aiBorder,
  },
  refreshBtnText: { fontSize: 12, fontWeight: "700", color: colors.aiDark },
  summaryLoadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  summaryLoadingTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  summaryLoadingSub: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 17 },
  summaryErrorCard: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  summaryErrorTitle: { fontSize: 15, fontWeight: "700", color: colors.dangerText },
  summaryErrorSub: { fontSize: 12, color: colors.dangerText, textAlign: "center", marginTop: 4 },
  summaryContentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  summaryBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  flagsSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  flagsHeading: { fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm },
  flagItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.backgroundAlt,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  flagIconBox: { width: 22, alignItems: "center", justifyContent: "center", marginTop: 1 },
  flagText: { fontSize: 13, fontWeight: "600", color: colors.text },
  flagMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2, textTransform: "capitalize" },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  disclaimerText: { fontSize: 11, color: colors.textMuted, lineHeight: 16, flex: 1 },
});
