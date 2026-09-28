import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors, radius, spacing } from "../../lib/theme";

export default function PatientLayout() {
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
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "Vault Records",
          tabBarLabel: "Records",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>📁</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI Assistant",
          tabBarLabel: "AI Insights",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>🧠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: "Medications",
          tabBarLabel: "Meds",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>💊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.7 }}>👤</Text>
          ),
        }}
      />
      {/* Hidden detail screens */}
      <Tabs.Screen name="timeline" options={{ href: null, title: "Health Timeline" }} />
      <Tabs.Screen name="upload" options={{ href: null, title: "Upload Record" }} />
      <Tabs.Screen name="emergency" options={{ href: null, title: "Emergency Card" }} />
      <Tabs.Screen name="access" options={{ href: null, title: "Doctor Access Permissions" }} />
    </Tabs>
  );
}
