import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { colors, radius, shadows, spacing } from "../../lib/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!emailOrPhone.trim() || !password) {
      setError("Enter your email or phone number and password");
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ emailOrPhone: emailOrPhone.trim().toLowerCase(), password });
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

  function fillDemo(email: string, pass: string) {
    setEmailOrPhone(email);
    setPassword(pass);
    setError(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Brand Emblem */}
          <View style={styles.brand}>
            <LinearGradient
              colors={[colors.primaryLight, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
            </LinearGradient>
            <Text style={styles.brandTitle}>MediVault</Text>
            <Text style={styles.brandTagline}>Patient-Centric AI Medical Records Platform</Text>
            <View style={styles.securityPill}>
              <Ionicons name="lock-closed" size={11} color={colors.primaryDark} />
              <Text style={styles.securityText}>HIPAA-Compliant · FHIR Structured</Text>
            </View>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to your Vault</Text>
            <Text style={styles.cardSubtitle}>Access your medical records or clinical dashboard</Text>

            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>Email address or phone number</Text>
              <TextInput
                value={emailOrPhone}
                onChangeText={setEmailOrPhone}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com or +12025550100"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••••••"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

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
                <Text style={styles.buttonText}>Sign In to Vault</Text>
              )}
            </Pressable>

            {/* Demo Quick Fill Helper */}
            <View style={styles.demoSection}>
              <Text style={styles.demoTitle}>Quick Demo Logins:</Text>
              <View style={styles.demoRow}>
                <Pressable
                  onPress={() => fillDemo("talhabakhat1122@gmail.com", "password123")}
                  style={({ pressed }) => [styles.demoChip, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="person" size={12} color={colors.primaryDark} style={{ marginRight: 4 }} />
                  <Text style={styles.demoChipText}>Patient (Ahmad)</Text>
                </Pressable>
                <Pressable
                  onPress={() => fillDemo("dr.sarah@hospital.org", "DoctorPass123!")}
                  style={({ pressed }) => [styles.demoChip, pressed && { opacity: 0.8 }]}
                >
                  <MaterialCommunityIcons name="doctor" size={14} color={colors.primaryDark} style={{ marginRight: 4 }} />
                  <Text style={styles.demoChipText}>Doctor (Dr. Sarah)</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.hint}>
              Don&apos;t have an account?{" "}
              <Link href="/(auth)/register" replace style={styles.link}>
                Create an account
              </Link>
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
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  brandTitle: { fontSize: 28, fontWeight: "900", color: colors.primary, letterSpacing: -0.5 },
  brandTagline: { marginTop: 4, color: colors.textMuted, fontSize: 13, textAlign: "center" },
  securityPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    marginTop: spacing.sm,
    gap: 4,
  },
  securityText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  buttonText: { color: colors.primaryText, fontWeight: "800", fontSize: 15 },
  demoSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  demoTitle: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: spacing.xs },
  demoRow: { flexDirection: "row", gap: spacing.sm },
  demoChip: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.backgroundAlt,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoChipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  hint: { marginTop: spacing.lg, color: colors.textMuted, textAlign: "center", fontSize: 13 },
  link: { color: colors.primary, fontWeight: "800" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  error: { color: colors.danger, fontSize: 12, fontWeight: "600", flex: 1 },
});
