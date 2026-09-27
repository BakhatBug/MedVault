import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// expo-secure-store works on iOS (Keychain) and Android (KeyStore) but NOT on
// web. On web we fall back to localStorage; it's not as secure, but for the
// `expo start --web` dev surface that's acceptable.

const ACCESS_KEY = "medivault.access";
const REFRESH_KEY = "medivault.refresh";

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof globalThis.localStorage !== "undefined") {
      return globalThis.localStorage.getItem(key);
    }
    return null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export type StoredTokens = { access: string; refresh: string };

export const tokenStore = {
  async save(tokens: StoredTokens): Promise<void> {
    await setItem(ACCESS_KEY, tokens.access);
    await setItem(REFRESH_KEY, tokens.refresh);
  },
  async loadAccess(): Promise<string | null> {
    return getItem(ACCESS_KEY);
  },
  async loadRefresh(): Promise<string | null> {
    return getItem(REFRESH_KEY);
  },
  async clear(): Promise<void> {
    await deleteItem(ACCESS_KEY);
    await deleteItem(REFRESH_KEY);
  },
};
