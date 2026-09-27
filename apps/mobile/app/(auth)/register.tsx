import { Link, useRouter } from "expo-router";
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
import { useAuth } from "../../lib/auth-context";
import { colors, radius, shadows, spacing } from "../../lib/theme";

type RoleType = "PATIENT" | "DOCTOR" | "CAREGIVER";

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<RoleType>("PATIENT");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("2000-01-01");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseCountry, setLicenseCountry] = useState("US");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!fullName.trim()) return "Enter your full legal name";
    if (role === "PATIENT") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
        return "Date of birth must be YYYY-MM-DD (e.g. 2000-01-01)";
      }
    }
    if (role === "DOCTOR") {
      if (!licenseNumber.trim()) return "Enter your medical license number";
      if (!licenseCountry.trim() || licenseCountry.trim().length !== 2) {
        return "Enter a 2-letter license country code (e.g. US, PK, GB)";
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) return "Phone must be in E.164 format (e.g. +12025550100 or +923001234567)";
    if (password.length < 8) return "Password must be at least 8 characters";
    return null;
  }

  async function onSubmit() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      const { userId, devOtp } = await register({
        role,
        email: email.trim().toLowerCase(),
        phoneE164: phone.trim(),
        password,
        fullName: fullName.trim(),
        ...(role === "PATIENT" ? { dateOfBirth: dateOfBirth.trim() } : {}),
        ...(role === "DOCTOR"
          ? { licenseNumber: licenseNumber.trim(), licenseCountry: licenseCountry.trim().toUpperCase() }
          : {}),
      });
      router.replace({ pathname: "/(auth)/verify-otp", params: { userId, phone, devOtp } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not create account. Try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Brand Header */}
          <View style={styles.brand}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>🩺</Text>
            </View>
            <Text style={styles.brandTitle}>MediVault</Text>
            <Text style={styles.brandSubtitle}>INTELLIGENT HEALTHCARE RECORDS</Text>
          </View>

          {/* Registration Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Create your account</Text>
            <Text style={styles.cardSub}>Select your role to configure your portal</Text>

            {/* Role Switcher */}
            <View style={styles.roleGrid}>
              {(
                [
                  { id: "PATIENT", label: "Patient", icon: "👤", desc: "Personal Vault" },
                  { id: "DOCTOR", label: "Doctor", icon: "🩺", desc: "Clinical EHR" },
                  { id: "CAREGIVER", label: "Caregiver", icon: "🤝", desc: "Family Proxy" },
                ] as const
              ).map((item) => {
                const isSelected = role === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setRole(item.id);
                      setError(null);
                    }}
                    style={[styles.roleOption, isSelected && styles.roleOptionActive]}
                  >
                    <Text style={styles.roleIcon}>{item.icon}</Text>
                    <Text style={[styles.roleOptionLabel, isSelected && styles.roleOptionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.roleOptionDesc, isSelected && styles.roleOptionDescActive]}>
                      {item.desc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Form Fields */}
            <Field label={role === "DOCTOR" ? "Full Name & Degree (e.g. Dr. Sarah Connor, MD)" : "Full Legal Name"}>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder={role === "DOCTOR" ? "Dr. Sarah Connor, MD" : "Alice Johnson"}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </Field>

            {role === "PATIENT" ? (
              <Field label="Date of Birth (YYYY-MM-DD)">
                <TextInput
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="2000-01-01"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  editable={!submitting}
                />
              </Field>
            ) : null}

            {role === "DOCTOR" ? (
              <>
                <Field label="Medical License Number">
                  <TextInput
                    value={licenseNumber}
                    onChangeText={setLicenseNumber}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="MD-982341"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    editable={!submitting}
                  />
                </Field>
                <Field label="License Country Code (2 letters, e.g. US, PK, GB)">
                  <TextInput
                    value={licenseCountry}
                    onChangeText={setLicenseCountry}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={2}
                    placeholder="US"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    editable={!submitting}
                  />
                </Field>
              </>
            ) : null}

            <Field label="Email Address">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={role === "DOCTOR" ? "dr.connor@hospital.org" : "alice@example.com"}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </Field>

            <Field label="Phone Number (E.164 format with country code)">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
                placeholder="+12025550100"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
              <Text style={styles.hint}>A 6-digit SMS code will be sent for instant 2-step verification.</Text>
            </Field>

            <Field label="Password">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </Field>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.button,
                pressed && !submitting && { opacity: 0.88 },
                submitting && { opacity: 0.6 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>
                  {role === "DOCTOR"
                    ? "Register Clinical Account"
                    : role === "CAREGIVER"
                    ? "Register Caregiver Account"
                    : "Create Patient Vault"}
                </Text>
              )}
            </Pressable>

            <Text style={styles.footer}>
              Already have an account?{" "}
              <Link href="/(auth)/login" replace style={styles.link}>
                Sign in
              </Link>
            </Text>
          </View>

          {/* Privacy Disclaimer */}
          <View style={styles.trustBanner}>
            <Text style={styles.trustEmoji}>🔒</Text>
            <Text style={styles.trustText}>
              256-Bit Cryptographic Vault & Zero-Trust Access Control. AI-extracted records provide clinical decision
              support.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, paddingBottom: spacing.xxl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  logoIcon: { fontSize: 30 },
  brandTitle: { fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  cardHeading: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  roleGrid: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  roleOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  roleOptionActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  roleIcon: { fontSize: 20, marginBottom: 2 },
  roleOptionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  roleOptionLabelActive: { color: colors.primaryDark },
  roleOptionDesc: { fontSize: 9, color: colors.textMuted, marginTop: 1, textAlign: "center" },
  roleOptionDescActive: { color: colors.primary, fontWeight: "600" },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  errorIcon: { fontSize: 16 },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: "600", flex: 1 },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadows.sm,
  },
  buttonText: { color: colors.primaryText, fontWeight: "700", fontSize: 16 },
  footer: { marginTop: spacing.lg, color: colors.textMuted, textAlign: "center", fontSize: 13 },
  link: { color: colors.primary, fontWeight: "700" },
  trustBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    justifyContent: "center",
  },
  trustEmoji: { fontSize: 16 },
  trustText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
    textAlign: "center",
  },
});

