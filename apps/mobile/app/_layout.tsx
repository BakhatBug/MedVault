import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavigationGate />
        <StatusBar style="auto" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Redirects based on auth state. Mounted once at the top of the tree.
function NavigationGate() {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Four route groups: (auth), (patient), (doctor), (caregiver). The signed-in
  // user's role decides which tree they live in.
  useEffect(() => {
    if (state.status === "loading") return;
    const top = segments[0];
    const inAuthGroup = top === "(auth)";

    if (state.status === "signed-out") {
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }
    const role = state.user.role;
    const target =
      role === "DOCTOR" ? "(doctor)" : role === "CAREGIVER" ? "(caregiver)" : "(patient)";
    if (top !== target) {
      router.replace(`/${target}` as "/(patient)" | "/(doctor)" | "/(caregiver)");
    }
  }, [state, segments, router]);

  const screenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
    [],
  );

  if (state.status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(patient)" />
      <Stack.Screen name="(doctor)" />
      <Stack.Screen name="(caregiver)" />
    </Stack>
  );
}
