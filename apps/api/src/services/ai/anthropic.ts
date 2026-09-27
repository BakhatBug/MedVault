import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import type { AICallInput, AICallOutput, AIProvider } from "./provider.js";

class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      if (!config.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }
      this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async call(input: AICallInput): Promise<AICallOutput> {
    const client = this.getClient();
    const res = await client.messages.create({
      model: input.modelId,
      max_tokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.2,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: input.userContent.map((block) => {
            if (block.type === "text") return { type: "text" as const, text: block.text };
            if (block.type === "image") {
              return {
                type: "image" as const,
                source: { type: "base64" as const, media_type: block.mediaType, data: block.dataBase64 },
              };
            }
            return {
              type: "document" as const,
              source: { type: "base64" as const, media_type: block.mediaType, data: block.dataBase64 },
            };
          }),
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      modelId: res.model,
      provider: "anthropic" as const,
    };
  }
}

export const anthropicProvider = new AnthropicProvider();
