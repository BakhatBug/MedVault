import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

export default function CaregiverLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Patients" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* sub-routes reachable via router.push, hidden from the tab bar */}
      <Tabs.Screen name="patient/[code]" options={{ href: null }} />
      <Tabs.Screen name="patient/[code]/upload" options={{ href: null }} />
    </Tabs>
  );
}
