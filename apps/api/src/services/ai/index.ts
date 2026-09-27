import { config } from "../../config.js";
import { geminiProvider } from "./gemini.js";
import { anthropicProvider } from "./anthropic.js";
import { bedrockProvider } from "./bedrock.js";
import type { AIProvider } from "./provider.js";

export function pickProvider(opts: { hipaaTenant: boolean }): AIProvider {
  // HIPAA tenants must route to a BAA-eligible path. Bedrock for Claude;
  // Vertex AI for Gemini (not implemented yet — would be a separate provider).
  if (opts.hipaaTenant) return bedrockProvider;
  switch (config.AI_PROVIDER) {
    case "gemini":
      return geminiProvider;
    case "anthropic":
      return anthropicProvider;
    case "bedrock":
      return bedrockProvider;
  }
}

export type { AIProvider, AICallInput, AICallOutput, AIContentBlock } from "./provider.js";
