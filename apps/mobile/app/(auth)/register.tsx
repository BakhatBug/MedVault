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
import { colors, radius, spacing } from "../../lib/theme";

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
    if (!fullName.trim()) return "Enter your full name";
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
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>MediVault</Text>
            <Text style={styles.brandTagline}>
              {role === "DOCTOR"
                ? "AI-powered clinical workspace & patient record access."
                : role === "CAREGIVER"
                ? "Manage and safeguard health records for your family."
                : "Your complete health records & AI clinical insights in your vault."}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.roleLabel}>I am registering as a:</Text>
            <View style={styles.roleSelector}>
              {(["PATIENT", "DOCTOR", "CAREGIVER"] as RoleType[]).map((r) => {
                const isSelected = role === r;
                const label = r === "PATIENT" ? "Patient" : r === "DOCTOR" ? "Doctor" : "Caregiver";
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      setRole(r);
                      setError(null);
                    }}
                    style={[styles.roleTab, isSelected && styles.roleTabActive]}
                  >
                    <Text style={[styles.roleTabText, isSelected && styles.roleTabTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Field label={role === "DOCTOR" ? "Full Name & Title (e.g. Dr. Sarah Connor)" : "Full Name"}>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder={role === "DOCTOR" ? "Dr. Sarah Connor, MD" : "Alice Patient"}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </Field>

            {role === "PATIENT" ? (
              <Field label="Date of birth (YYYY-MM-DD)">
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

            <Field label="Email address">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={role === "DOCTOR" ? "dr.connor@hospital.org" : "you@example.com"}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                editable={!submitting}
              />
            </Field>

            <Field label="Phone (E.164 with country code)">
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
              <Text style={styles.hint}>We&apos;ll send a 6-digit verification code to this phone number.</Text>
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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.button,
                pressed && !submitting && { opacity: 0.85 },
                submitting && { opacity: 0.6 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>
                  {role === "DOCTOR" ? "Register Doctor Account" : role === "CAREGIVER" ? "Register Caregiver Account" : "Create Vault Account"}
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

          <Text style={styles.legal}>
            By creating an account you agree to MediVault&apos;s Terms and Privacy Policy. AI-extracted content is
            clinical decision support — always verify with original diagnostic records.
          </Text>
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
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  brandTitle: { fontSize: 28, fontWeight: "700", color: colors.primary },
  brandTagline: {
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
  roleLabel: { color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs },
  roleSelector: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  roleTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    borderRadius: radius.sm,
  },
  roleTabActive: {
    backgroundColor: colors.primary,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  roleTabTextActive: {
    color: colors.primaryText,
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
  hint: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
  },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
  footer: { marginTop: spacing.lg, color: colors.textMuted, textAlign: "center", fontSize: 13 },
  link: { color: colors.primary, fontWeight: "600" },
  legal: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: 13 },
});
