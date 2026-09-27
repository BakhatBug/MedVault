// Minimal FHIR R4 resource shapes used by MediVault.
//
// We do NOT pull in @types/fhir or fhir-types — they're enormous (300+ resource
// types) and we only need a handful. When we eventually move clinical storage to
// a real FHIR server (HAPI / Medplum), these shapes become the wire contract.

export type FhirCoding = {
  system?: string; // e.g., "http://snomed.info/sct" | "http://www.nlm.nih.gov/research/umls/rxnorm"
  code?: string;
  display?: string;
};

export type FhirCodeableConcept = {
  coding?: FhirCoding[];
  text?: string;
};

export type FhirReference = {
  reference?: string;
  display?: string;
};

export type FhirAllergyIntolerance = {
  resourceType: "AllergyIntolerance";
  id?: string;
  clinicalStatus?: FhirCodeableConcept;
  category?: ("food" | "medication" | "environment" | "biologic")[];
  criticality?: "low" | "high" | "unable-to-assess";
  code: FhirCodeableConcept;
  recordedDate?: string; // ISO-8601
};

export type FhirCondition = {
  resourceType: "Condition";
  id?: string;
  clinicalStatus?: FhirCodeableConcept;
  code: FhirCodeableConcept;
  onsetDateTime?: string;
  recordedDate?: string;
};

export type FhirMedicationRequest = {
  resourceType: "MedicationRequest";
  id?: string;
  status: "active" | "on-hold" | "cancelled" | "completed" | "stopped" | "draft" | "unknown";
  intent: "proposal" | "plan" | "order";
  medicationCodeableConcept: FhirCodeableConcept;
  dosageInstruction?: {
    text?: string;
    timing?: { code?: FhirCodeableConcept };
    doseAndRate?: { doseQuantity?: { value: number; unit: string } }[];
  }[];
  authoredOn?: string;
};

export type FhirObservation = {
  resourceType: "Observation";
  id?: string;
  status: "registered" | "preliminary" | "final" | "amended" | "corrected" | "cancelled" | "entered-in-error" | "unknown";
  code: FhirCodeableConcept;
  effectiveDateTime?: string;
  valueQuantity?: { value: number; unit: string; system?: string; code?: string };
  valueString?: string;
  interpretation?: FhirCodeableConcept[];
};

export type FhirImmunization = {
  resourceType: "Immunization";
  id?: string;
  status: "completed" | "entered-in-error" | "not-done";
  vaccineCode: FhirCodeableConcept;
  occurrenceDateTime: string;
  lotNumber?: string;
};

// Output of the AI document extractor — a Bundle-like wrapper around extracted resources.
export type ExtractionResult = {
  resourceType: "Bundle";
  type: "collection";
  meta: { extractedAt: string; modelId: string; sourceRecordId: string };
  entry: { resource: FhirAllergyIntolerance | FhirCondition | FhirMedicationRequest | FhirObservation | FhirImmunization }[];
};
