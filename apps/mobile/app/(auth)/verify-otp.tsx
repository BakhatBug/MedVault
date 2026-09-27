import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "../../lib/auth-context";
import { colors, radius, spacing } from "../../lib/theme";

// 6-digit OTP entry. We render six individual cells so the focus animation and
// auto-advance behavior feels right on phones, but internally we still store a
// single 6-char string for the API call.
export default function VerifyOtpScreen() {
  const { verifyOtp, resendOtp } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; phone?: string; devOtp?: string }>();
  const userId = typeof params.userId === "string" ? params.userId : null;
  const phone = typeof params.phone === "string" ? params.phone : null;
  const [devOtp, setDevOtp] = useState<string | null>(typeof params.devOtp === "string" ? params.devOtp : null);

  const [digits, setDigits] = useState<string[]>(
    typeof params.devOtp === "string" && params.devOtp.length === 6
      ? params.devOtp.split("")
      : ["", "", "", "", "", ""],
  );
  const refs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resend state: countdown starts at 60s after register, ticks down. When 0,
  // the resend button is tappable. After a successful resend, it restarts.
  const [resendCountdown, setResendCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  async function onResend() {
    if (!userId || resendCountdown > 0 || resending) return;
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      const res = await resendOtp({ userId });
      setResendCountdown(res.cooldownSeconds);
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        setDigits(res.devOtp.split(""));
      }
      setResendMessage("New code sent. Check your messages.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not resend.";
      // If the server reports a cooldown we don't know about, reset to a safe value.
      if (msg.toLowerCase().includes("wait")) {
        setResendCountdown(60);
      }
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  function setDigit(index: number, raw: string) {
    // Accept paste of the whole code into the first cell.
    if (raw.length > 1) {
      const cleaned = raw.replace(/\D/g, "").slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      cleaned.forEach((d, i) => {
        next[i] = d;
      });
      setDigits(next);
      const focusIdx = Math.min(cleaned.length, 5);
      refs.current[focusIdx]?.focus();
      if (cleaned.length === 6) void onSubmit(cleaned.join(""));
      return;
    }
    const cleaned = raw.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) refs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) void onSubmit(next.join(""));
  }

  function onBackspace(index: number) {
    if (digits[index]) return;
    if (index > 0) refs.current[index - 1]?.focus();
  }

  async function onSubmit(code: string) {
    setError(null);
    if (!userId) {
      setError("Missing registration context. Restart the sign-up flow.");
      return;
    }
    if (code.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyOtp({ userId, code });
      // verifyOtp signs the user in; the root navigation gate will redirect
      // to /(patient). No explicit push needed.
    } catch (e) {
      if (e instanceof ApiError && (e.code === "otp_invalid" || e.code === "otp_expired")) {
        setError(
          e.code === "otp_expired"
            ? "That code has expired. Restart sign-up to get a fresh code."
            : "That code didn't match. Try again.",
        );
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Could not verify. Try again.");
      }
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.title}>Verify your number</Text>
            <Text style={styles.subtitle}>
              We texted a 6-digit code{phone ? ` to ${phone}` : ""}. Enter it below to activate your account.
            </Text>
            {devOtp ? (
              <Text style={{ marginTop: spacing.xs, color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                Dev verification code: {devOtp}
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.cells}>
              {digits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  value={d}
                  onChangeText={(t) => setDigit(i, t)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === "Backspace") onBackspace(i);
                  }}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? 6 : 1}
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
                  style={[styles.cell, d ? styles.cellFilled : null]}
                  editable={!submitting}
                />
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {submitting ? (
              <View style={styles.spinner}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.spinnerText}>Verifying…</Text>
              </View>
            ) : null}

            {resendMessage ? <Text style={styles.success}>{resendMessage}</Text> : null}

            <Pressable
              onPress={onResend}
              disabled={resendCountdown > 0 || resending || submitting}
              style={({ pressed }) => [pressed && resendCountdown === 0 && { opacity: 0.85 }]}
            >
              <Text style={[styles.link, (resendCountdown > 0 || resending) && styles.linkDisabled]}>
                {resending
                  ? "Resending…"
                  : resendCountdown > 0
                    ? `Resend code in ${resendCountdown}s`
                    : "Resend code"}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/(auth)/register")} disabled={submitting}>
              <Text style={styles.linkSubtle}>Use a different number</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cells: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  cell: {
    width: 44,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: colors.background,
  },
  cellFilled: { borderColor: colors.primary, backgroundColor: colors.surface },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, textAlign: "center" },
  spinner: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.md, gap: spacing.sm },
  spinnerText: { color: colors.text, fontSize: 13 },
  link: { color: colors.primary, fontWeight: "600", textAlign: "center", marginTop: spacing.lg, fontSize: 13 },
  linkSubtle: { color: colors.textMuted, textAlign: "center", marginTop: spacing.md, fontSize: 12 },
  linkDisabled: { color: colors.textMuted },
  success: { color: colors.success, fontSize: 13, marginTop: spacing.sm, textAlign: "center" },
});
