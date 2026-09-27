import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger.js";
import type { SmsMessage, SmsProvider } from "./provider.js";

class MockSmsProvider implements SmsProvider {
  readonly id = "mock" as const;
  async send(msg: SmsMessage): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    // Dev-only: log to stdout so you can grab the OTP from the API console.
    // In production, swap to twilioProvider — see services/sms/index.ts.
    logger.warn(
      { sms: { to: msg.toE164, body: msg.body, messageId } },
      "[mock-sms] would send",
    );
    return { messageId };
  }
}

export const mockSmsProvider = new MockSmsProvider();
