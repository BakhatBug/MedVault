// SMS provider abstraction — same shape as the AI provider abstraction.
// Concrete impls: mock (dev), twilio (prod default), AWS SNS (HIPAA path).

export interface SmsMessage {
  toE164: string;
  body: string;
  // For audit + dedup. Carriers reject bodies with the same hash sent in <60s.
  idempotencyKey?: string;
}

export interface SmsProvider {
  readonly id: "mock" | "twilio" | "sns";
  send(msg: SmsMessage): Promise<{ messageId: string }>;
}
