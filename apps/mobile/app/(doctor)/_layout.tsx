import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../lib/theme";

export default function DoctorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: colors.text,
          fontWeight: "700",
          fontSize: 17,
          letterSpacing: -0.3,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Patient Lookup",
          tabBarLabel: "Search",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>🔍</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Access Permissions",
          tabBarLabel: "Requests",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>📋</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Clinical Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>👨‍⚕️</Text>
          ),
        }}
      />
      {/* Patient detail is reachable via router.push("/(doctor)/patient/MVK-…") but hidden from the tab bar */}
      <Tabs.Screen name="patient/[code]" options={{ href: null, title: "Patient Clinical Chart" }} />
      <Tabs.Screen name="patient/[code]/ask" options={{ href: null, title: "Ask AI Assistant" }} />
    </Tabs>
  );
}
