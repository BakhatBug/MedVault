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
import { colors, radius, shadows, spacing } from "../../lib/theme";

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
    Alert.alert("Decline invitation?", "The patient will need to invite you again if needed.", [
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
        <RefreshControl
          refreshing={links.isFetching}
          onRefresh={() => void links.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Managed Patients</Text>
        <Text style={styles.subtitle}>
          Authorized family proxy access to manage records and clinical uploads.
        </Text>
      </View>

      {/* Pending Invitations */}
      {pending.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PENDING INVITATIONS ({pending.length})</Text>
          {pending.map((l) => (
            <View key={l.id} style={styles.invitationCard}>
              <View style={styles.invitationHeader}>
                <View style={styles.invitationAvatar}>
                  <Text style={styles.invitationAvatarText}>
                    {(l.patient.fullName ?? "PT")
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{l.patient.fullName}</Text>
                  <View style={styles.codePill}>
                    <Text style={styles.codeText}>{l.patient.patientCode}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.invitationNote}>
                Invited you as an authorized caregiver proxy with permission to view records and upload documents.
              </Text>

              <View style={styles.invitationActions}>
                <Pressable
                  onPress={() => onDecline(l.id)}
                  disabled={busyId === l.id}
                  style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => onAccept(l.id)}
                  disabled={busyId === l.id}
                  style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.85 }]}
                >
                  {busyId === l.id ? (
                    <ActivityIndicator color={colors.primaryText} size="small" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept Proxy</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Active Patients */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIVE PATIENT VAULTS</Text>

        {links.isLoading ? (
          <View style={styles.loadingBox}>
            <Text style={styles.muted}>Loading patient vaults…</Text>
          </View>
        ) : active.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🤝</Text>
            <Text style={styles.emptyTitle}>No Active Patient Proxies</Text>
            <Text style={styles.emptySub}>
              When a family member or patient links you as their caregiver from their account, their vault will appear
              here.
            </Text>
          </View>
        ) : (
          active.map((l: CaregiverLink) => {
            const initials = (l.patient.fullName ?? "PT")
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <Pressable
                key={l.id}
                onPress={() =>
                  router.push({
                    pathname: "/(caregiver)/patient/[code]",
                    params: { code: l.patient.patientCode },
                  })
                }
                style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.patientAvatar}>
                  <Text style={styles.patientAvatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{l.patient.fullName}</Text>
                  <View style={styles.codePill}>
                    <Text style={styles.codeText}>{l.patient.patientCode}</Text>
                  </View>
                </View>
                <View style={styles.viewBadge}>
                  <Text style={styles.viewBadgeText}>Open Vault ›</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  invitationCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  invitationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  invitationAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
  },
  invitationAvatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B45309",
  },
  patientName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  codePill: {
    backgroundColor: colors.surfaceSecondary,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  codeText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textMuted,
    fontWeight: "600",
  },
  invitationNote: {
    fontSize: 12,
    color: "#92400E",
    marginTop: spacing.md,
    lineHeight: 16,
  },
  invitationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  declineBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  declineBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  acceptBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    minWidth: 100,
  },
  acceptBtnText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: "700",
  },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    gap: spacing.md,
  },
  patientAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  patientAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  viewBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  loadingBox: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

