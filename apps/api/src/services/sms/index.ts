import { config } from "../../config.js";
import { mockSmsProvider } from "./mock.js";
import type { SmsProvider } from "./provider.js";

// Twilio + SNS impls are stubs until we onboard a real tenant.
// All call sites should go through `getSmsProvider()` — never import an impl directly.
export function getSmsProvider(): SmsProvider {
  switch (config.SMS_PROVIDER) {
    case "mock":
      return mockSmsProvider;
    case "twilio":
      throw new Error("twilio SMS provider not implemented yet");
    case "sns":
      throw new Error("SNS SMS provider not implemented yet");
  }
}

export type { SmsProvider, SmsMessage } from "./provider.js";
