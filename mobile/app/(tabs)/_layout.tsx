import { Tabs } from "expo-router";
import { Newspaper, ScanBarcode } from "lucide-react-native";

const ACCENT = "#22c55e"; // penny green

/** Bottom tab bar: Live Feed + Scanner. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0f14" },
        headerTitleStyle: { color: "#f1f5f9", fontWeight: "700" },
        tabBarStyle: { backgroundColor: "#0b0f14", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Penny Feed",
          tabBarIcon: ({ color, size }) => (
            <Newspaper color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scan Item",
          tabBarIcon: ({ color, size }) => (
            <ScanBarcode color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
