import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

async function testAll() {
  console.log("=== TESTING ALL MEDIVAULT AI SERVICES ===");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // 1. Test Summary
  console.log("\n1. Testing Patient Summary with gemini-2.5-flash...");
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: JSON.stringify({
        patient: { name: "Alice", age: 34, gender: "Female", conditions: ["Asthma", "Hypertension"] },
        medications: [{ name: "Albuterol", dosage: "90mcg", frequency: "as needed" }, { name: "Lisinopril", dosage: "10mg", frequency: "daily" }],
        records: [{ category: "LAB_RESULT", text: "Blood pressure 130/85. SpO2 98%." }]
      }),
      config: {
        systemInstruction: "You are a clinical summarizer for MediVault. Output a single JSON object with { \"summary\": \"<markdown>\", \"flags\": [] }."
      }
    });
    console.log("Summary Success:", res.text);
  } catch (err) {
    console.error("Summary Error:", err.message || err);
  }

  // 2. Test Doctor Q&A
  console.log("\n2. Testing Doctor Q&A with gemini-2.5-flash...");
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "PATIENT JSON: {\"allergies\": [\"Penicillin\"], \"medications\": [\"Lisinopril 10mg\"]}\nQUESTION: Does the patient have any drug allergies?",
      config: {
        systemInstruction: "You are a clinical Q&A assistant for MediVault. Answer concisely from the records only."
      }
    });
    console.log("Doctor Q&A Success:", res.text);
  } catch (err) {
    console.error("Doctor Q&A Error:", err.message || err);
  }

  // 3. Test Drug Interaction Check
  console.log("\n3. Testing Drug Interaction Check with gemini-2.5-flash...");
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: JSON.stringify({
        medications: [{ name: "Warfarin", dosage: "5mg" }, { name: "Aspirin", dosage: "81mg" }]
      }),
      config: {
        systemInstruction: "Identify drug-drug interactions. Output JSON: { \"interactions\": [ { \"medications\": [\"Warfarin\", \"Aspirin\"], \"severity\": \"major\", \"description\": \"Increased bleeding risk\" } ] }"
      }
    });
    console.log("Drug Interaction Success:", res.text);
  } catch (err) {
    console.error("Drug Interaction Error:", err.message || err);
  }
}

testAll();
