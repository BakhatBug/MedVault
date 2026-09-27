import Constants from "expo-constants";
import { Platform } from "react-native";

// API base URL.
// - iOS simulator: localhost works
// - Android emulator: 10.0.2.2 maps to host machine's localhost
// - Physical device: must use the host machine's LAN IP (set via EXPO_PUBLIC_API_URL)
export function resolveApiUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:3001`;
  }
  const fromEnv = process.env["EXPO_PUBLIC_API_URL"];
  if (fromEnv) return fromEnv;
  if (Platform.OS === "android") return "http://10.0.2.2:3001";
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost") return `http://${host}:3001`;
  }
  return "http://localhost:3001";
}

export const API_URL = resolveApiUrl();
export const API_PREFIX = "/v1";

