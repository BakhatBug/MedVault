import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Key length:", apiKey ? apiKey.length : 0);

async function run() {
  const ai = new GoogleGenAI({ apiKey });
  
  for (const model of ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"]) {
    try {
      console.log(`\nTesting model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: "Say 'MediVault AI is active!' in exactly 4 words.",
      });
      console.log(`[${model}] Response:`, response.text?.trim());
    } catch (err) {
      console.error(`[${model}] Error:`, err.message || err);
    }
  }
}

run();
