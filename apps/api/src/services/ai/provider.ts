// Provider abstraction for the AI layer.
//
// Why abstract: HIPAA tenants must route through AWS Bedrock (BAA-eligible).
// Non-HIPAA tenants can use Anthropic direct (cheaper, faster cold starts).
// The concrete provider is selected per-tenant from User.hipaaTenant.
//
// Every concrete implementation MUST:
//   - report token usage so we can write to ai_call_logs
//   - accept image content (PDFs / scans converted to base64) for extraction
//   - support a system prompt + user message pair (kept simple on purpose)
//
// New providers (e.g., self-hosted Llama) only need to implement this interface.

export interface AICallInput {
  modelId: string;
  systemPrompt: string;
  userContent: AIContentBlock[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export type AIContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; dataBase64: string }
  | { type: "document"; mediaType: "application/pdf"; dataBase64: string };

export type AIProviderId = "gemini" | "anthropic" | "bedrock";

export interface AICallOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  provider: AIProviderId;
}

export interface AIProvider {
  readonly id: AIProviderId;
  call(input: AICallInput): Promise<AICallOutput>;
}
