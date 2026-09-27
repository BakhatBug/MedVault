import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ApiError } from "../../lib/api";
import {
  type CaregiverLink,
  useAcceptCaregiverLink,
  useCaregiverLinks,
  useDeclineCaregiverLink,
} from "../../lib/queries";
import { colors, radius, spacing } from "../../lib/theme";

// Caregiver landing: pending invitations (accept/decline) on top, then the list
// of patients the caregiver actively manages.
export default function CaregiverHome() {
  const router = useRouter();
  const links = useCaregiverLinks();
  const accept = useAcceptCaregiverLink();
  const decline = useDeclineCaregiverLink();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = links.data?.items ?? [];
  const pending = items.filter((l) => l.status === "PENDING");
  const active = items.filter((l) => l.status === "ACTIVE");

  async function onAccept(id: string) {
    setBusyId(id);
    try {
      await accept.mutateAsync(id);
    } catch (e) {
      Alert.alert("Could not accept", e instanceof ApiError ? e.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function onDecline(id: string) {
    Alert.alert("Decline invitation?", "The patient will need to invite you again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await decline.mutateAsync(id);
          } catch (e) {
            Alert.alert("Could not decline", e instanceof ApiError ? e.message : "Try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={links.isFetching} onRefresh={() => void links.refetch()} tintColor={colors.primary} />
      }
    >
      <Text style={styles.title}>Your patients</Text>
      <Text style={styles.subtitle}>People who have linked you as their caregiver.</Text>

      {pending.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Invitations</Text>
          {pending.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.name}>{l.patient.fullName}</Text>
              <Text style={styles.code}>{l.patient.patientCode}</Text>
              <Text style={styles.meta}>Invited you to be their caregiver.</Text>
              <View style={styles.buttonRow}>
                <Pressable
                  onPress={() => onDecline(l.id)}
                  disabled={busyId === l.id}
                  style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => onAccept(l.id)}
                  disabled={busyId === l.id}
                  style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.85 }]}
                >
                  {busyId === l.id ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : (
                    <Text style={styles.acceptText}>Accept</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Managed patients</Text>
      {links.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : active.length === 0 ? (
        <Text style={styles.muted}>
          No active links yet. When a patient invites you and you accept, they&apos;ll appear here.
        </Text>
      ) : (
        active.map((l: CaregiverLink) => (
          <Pressable
            key={l.id}
            onPress={() =>
              router.push({ pathname: "/(caregiver)/patient/[code]", params: { code: l.patient.patientCode } })
            }
            style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.92 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{l.patient.fullName}</Text>
              <Text style={styles.code}>{l.patient.patientCode}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 13 },
  sectionTitle: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontWeight: "600", fontSize: 16 },
  code: { color: colors.textMuted, fontSize: 12, marginTop: 2, letterSpacing: 0.5 },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  buttonRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  acceptBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    minWidth: 100,
    alignItems: "center",
  },
  acceptText: { color: colors.primaryText, fontWeight: "600", fontSize: 14 },
  declineBtn: {
    backgroundColor: "#FBEAEA",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F0CCD0",
  },
  declineText: { color: colors.danger, fontWeight: "600", fontSize: 14 },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
});
