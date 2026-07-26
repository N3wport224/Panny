import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

/** Root layout — a single stack that hosts the tab navigator. */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
