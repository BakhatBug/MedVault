import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

export default function PatientLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="records" options={{ title: "Records" }} />
      <Tabs.Screen name="medications" options={{ title: "Meds" }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      {/* upload is reachable via router.push("/(patient)/upload") but hidden from the tab bar */}
      <Tabs.Screen name="upload" options={{ href: null }} />
      <Tabs.Screen name="emergency" options={{ href: null }} />
      <Tabs.Screen name="access" options={{ href: null }} />
    </Tabs>
  );
}
