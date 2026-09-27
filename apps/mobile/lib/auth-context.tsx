import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api } from "./api";
import { tokenStore } from "./token-store";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

export type AuthUser = {
  id: string;
  email: string;
  role: "PATIENT" | "DOCTOR" | "CAREGIVER" | "ADMIN";
  patientCode?: string;
  fullName?: string;
};

type AuthContextValue = {
  state: AuthState;
  signIn: (input: { emailOrPhone: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  // Registration is a two-step flow: register() returns the userId, then the
  // user enters the OTP they got via SMS and we call verifyOtp(). On success,
  // verifyOtp() also signs them in (server returns tokens), so the UI can flow
  // straight into the patient tabs.
  register: (input: RegisterInput) => Promise<{ userId: string; devOtp?: string }>;
  verifyOtp: (input: { userId: string; code: string }) => Promise<void>;
  resendOtp: (input: { userId: string }) => Promise<{ cooldownSeconds: number; devOtp?: string }>;
};

export type RegisterInput = {
  email: string;
  phoneE164: string;
  password: string;
  fullName: string;
  role?: "PATIENT" | "DOCTOR" | "CAREGIVER";
  dateOfBirth?: string;
  licenseNumber?: string;
  licenseCountry?: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Hydration: on app boot, check whether a stored token still works.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const access = await tokenStore.loadAccess();
      if (!access) {
        if (!cancelled) setState({ status: "signed-out" });
        return;
      }
      try {
        const me = await withTimeout(api<MeResponse>("/me"), 8000);
        if (cancelled) return;
        setState({ status: "signed-in", user: toAuthUser(me) });
      } catch {
        if (cancelled) return;
        await tokenStore.clear();
        setState({ status: "signed-out" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signIn(input) {
        const res = await api<LoginResponse>("/auth/login", {
          method: "POST",
          body: input,
          unauth: true,
        });
        await tokenStore.save({ access: res.accessToken, refresh: res.refreshToken });
        const me = await api<MeResponse>("/me");
        setState({ status: "signed-in", user: toAuthUser(me) });
      },
      async signOut() {
        const refresh = await tokenStore.loadRefresh();
        if (refresh) {
          try {
            await api("/auth/logout", { method: "POST", body: { refreshToken: refresh } });
          } catch {
            // ignore — we're signing out locally regardless
          }
        }
        await tokenStore.clear();
        setState({ status: "signed-out" });
      },
      async refresh() {
        try {
          const me = await api<MeResponse>("/me");
          setState({ status: "signed-in", user: toAuthUser(me) });
        } catch {
          await tokenStore.clear();
          setState({ status: "signed-out" });
        }
      },
      async register(input) {
        const res = await api<{ userId: string; devOtp?: string }>("/auth/register", {
          method: "POST",
          body: { ...input, role: input.role || "PATIENT" },
          unauth: true,
        });
        return { userId: res.userId, devOtp: res.devOtp };
      },
      async resendOtp(input) {
        const res = await api<{ resent: true; cooldownSeconds: number; devOtp?: string }>("/auth/resend-otp", {
          method: "POST",
          body: { userId: input.userId, purpose: "registration" },
          unauth: true,
        });
        return { cooldownSeconds: res.cooldownSeconds, devOtp: res.devOtp };
      },
      async verifyOtp(input) {
        const res = await api<LoginResponse>("/auth/verify-otp", {
          method: "POST",
          body: { ...input, purpose: "registration" },
          unauth: true,
        });
        await tokenStore.save({ access: res.accessToken, refresh: res.refreshToken });
        const me = await api<MeResponse>("/me");
        setState({ status: "signed-in", user: toAuthUser(me) });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: AuthUser["role"]; email: string };
};

type MeResponse = {
  id: string;
  email: string;
  role: AuthUser["role"];
  patientProfile?: { patientCode: string; fullName: string } | null;
  doctorProfile?: { fullName: string } | null;
};

function toAuthUser(me: MeResponse): AuthUser {
  return {
    id: me.id,
    email: me.email,
    role: me.role,
    ...(me.patientProfile?.patientCode ? { patientCode: me.patientProfile.patientCode } : {}),
    ...(me.patientProfile?.fullName ? { fullName: me.patientProfile.fullName } : me.doctorProfile?.fullName ? { fullName: me.doctorProfile.fullName } : {}),
  };
}
