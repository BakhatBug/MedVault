import type { AICallInput, AICallOutput, AIProvider } from "./provider.js";

// Stub. Real implementation will use @aws-sdk/client-bedrock-runtime InvokeModelCommand
// with the Anthropic Bedrock messages API shape. Deferred until a HIPAA tenant exists —
// no point pulling in 3MB of AWS SDK before we need it.
class BedrockProvider implements AIProvider {
  readonly id = "bedrock" as const;
  async call(_input: AICallInput): Promise<AICallOutput> {
    throw new Error(
      "Bedrock provider not implemented yet. Add @aws-sdk/client-bedrock-runtime when first HIPAA tenant onboards.",
    );
  }
}

export const bedrockProvider = new BedrockProvider();
