import { Link } from "expo-router";
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
import { useAuth } from "../../lib/auth-context";
import { ApiError } from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!emailOrPhone || !password) {
      setError("Enter your email/phone and password");
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ emailOrPhone, password });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Could not sign in. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>MediVault</Text>
            <Text style={styles.brandTagline}>Your health, in your pocket.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Email or phone</Text>
            <TextInput
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="alice@example.com"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.button,
                pressed && { opacity: 0.85 },
                submitting && { opacity: 0.6 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>

            <Text style={styles.hint}>
              No account yet?{" "}
              <Link href="/(auth)/register" style={styles.link}>
                Create one
              </Link>
              .
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xxl },
  brandTitle: { fontSize: 32, fontWeight: "700", color: colors.primary, letterSpacing: 0.5 },
  brandTagline: { marginTop: spacing.sm, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
  hint: { marginTop: spacing.lg, color: colors.textMuted, fontSize: 12, textAlign: "center" },
  link: { color: colors.primary, fontWeight: "600" },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    fontSize: 13,
  },
});
