import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { colors, radius, shadows, spacing } from "../../lib/theme";

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
      setResendMessage("New verification code sent.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not resend.";
      if (msg.toLowerCase().includes("wait")) {
        setResendCountdown(60);
      }
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  function setDigit(index: number, raw: string) {
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
    } catch (e) {
      if (e instanceof ApiError && (e.code === "otp_invalid" || e.code === "otp_expired")) {
        setError(
          e.code === "otp_expired"
            ? "That code has expired. Request a new code."
            : "Invalid code. Please double-check and try again.",
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
          {/* Header */}
          <View style={styles.brand}>
            <LinearGradient
              colors={[colors.primaryLight, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
            </LinearGradient>
            <Text style={styles.title}>2-Step Verification</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit cryptographic verification code to{"\n"}
              <Text style={styles.phoneHighlight}>{phone ?? "your phone"}</Text>
            </Text>

            {devOtp ? (
              <Pressable
                onPress={() => {
                  setDigits(devOtp.split(""));
                  void onSubmit(devOtp);
                }}
                style={styles.devOtpPill}
              >
                <Text style={styles.devOtpLabel}>DEV SHORTCUT: </Text>
                <Text style={styles.devOtpCode}>{devOtp}</Text>
                <Text style={styles.devOtpAction}> (Tap to Auto-fill)</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Card */}
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

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {submitting ? (
              <View style={styles.spinner}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.spinnerText}>Verifying authentication token…</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => onSubmit(digits.join(""))}
                disabled={digits.some((d) => !d) || submitting}
                style={({ pressed }) => [
                  styles.verifyBtn,
                  digits.every((d) => d) ? styles.verifyBtnActive : null,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={styles.verifyBtnText}>Confirm Code</Text>
              </Pressable>
            )}

            {resendMessage ? <Text style={styles.success}>{resendMessage}</Text> : null}

            <View style={styles.resendSection}>
              <Pressable
                onPress={onResend}
                disabled={resendCountdown > 0 || resending || submitting}
                style={({ pressed }) => [pressed && resendCountdown === 0 && { opacity: 0.85 }]}
              >
                <Text style={[styles.link, (resendCountdown > 0 || resending) && styles.linkDisabled]}>
                  {resending
                    ? "Sending new code…"
                    : resendCountdown > 0
                    ? `Resend code in ${resendCountdown}s`
                    : "Resend verification code"}
                </Text>
              </Pressable>

              <Pressable onPress={() => router.replace("/(auth)/register")} disabled={submitting}>
                <Text style={styles.linkSubtle}>Use a different phone number</Text>
              </Pressable>
            </View>
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
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  iconEmoji: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    fontSize: 13,
    lineHeight: 18,
  },
  phoneHighlight: {
    color: colors.text,
    fontWeight: "700",
  },
  devOtpPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  devOtpLabel: { color: colors.primaryDark, fontSize: 11, fontWeight: "700" },
  devOtpCode: { color: colors.primaryDark, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  devOtpAction: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  cells: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  cell: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    backgroundColor: colors.background,
    ...shadows.sm,
  },
  cellFilled: { borderColor: colors.primary, backgroundColor: colors.surface },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    gap: 6,
  },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center" },
  spinner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  spinnerText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" },
  verifyBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.borderLight,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  verifyBtnActive: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  verifyBtnText: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: "700",
  },
  resendSection: {
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  link: { color: colors.primary, fontWeight: "700", textAlign: "center", fontSize: 13 },
  linkSubtle: { color: colors.textMuted, textAlign: "center", fontSize: 12 },
  linkDisabled: { color: colors.textMuted, fontWeight: "500" },
  success: {
    color: colors.success,
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: "center",
    fontWeight: "600",
  },
});

