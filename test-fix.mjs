import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const res = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Extract clinical entities: Patient has Hypertension, prescribed Lisinopril 10mg PO daily, BP 140/90 mmHg",
    config: {
      systemInstruction: `You are a clinical data extractor for MediVault. Output ONLY a JSON object:
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    { "resource": { "resourceType": "Condition", "code": { "text": "Hypertension" } } },
    { "resource": { "resourceType": "MedicationRequest", "status": "active", "intent": "order", "medicationCodeableConcept": { "text": "Lisinopril 10mg" } } }
  ]
}
Allowed entry resourceType values: AllergyIntolerance, Condition, MedicationRequest, Observation, Immunization.`,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  });

  console.log("Raw output text:\n", res.text);
  const parsed = JSON.parse(res.text);
  console.log("\nParsed successfully, entries count:", parsed.entry?.length);
  console.log("Usage metadata:", res.usageMetadata);
}

test().catch(console.error);
