import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { config } from "../../config.js";
import type { AICallInput, AICallOutput, AIProvider, AIContentBlock } from "./provider.js";

class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      if (!config.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
      }
      this.client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
    return this.client;
  }

  async call(input: AICallInput): Promise<AICallOutput> {
    const client = this.getClient();
    const parts: Part[] = input.userContent.map(toGeminiPart);
    const contents: Content[] = [{ role: "user", parts }];

    const res = await client.models.generateContent({
      model: input.modelId,
      contents,
      config: {
        systemInstruction: input.systemPrompt,
        ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
    });

    // The SDK exposes either `.text` (concatenated text) or candidates with parts.
    const text = res.text ?? extractText(res);
    const usage = res.usageMetadata ?? {};

    return {
      text,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      modelId: input.modelId,
      provider: "gemini",
    };
  }
}

function toGeminiPart(block: AIContentBlock): Part {
  if (block.type === "text") return { text: block.text };
  return {
    inlineData: { mimeType: block.mediaType, data: block.dataBase64 },
  };
}

function extractText(res: { candidates?: Array<{ content?: { parts?: Part[] } }> }): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
    .join("");
}

export const geminiProvider = new GeminiProvider();
