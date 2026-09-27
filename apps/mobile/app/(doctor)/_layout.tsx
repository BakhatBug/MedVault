import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

export default function DoctorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Search" }} />
      <Tabs.Screen name="requests" options={{ title: "Requests" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* Patient detail is reachable via router.push("/(doctor)/patient/MVK-…") but hidden from the tab bar */}
      <Tabs.Screen name="patient/[code]" options={{ href: null }} />
      <Tabs.Screen name="patient/[code]/ask" options={{ href: null }} />
    </Tabs>
  );
}
