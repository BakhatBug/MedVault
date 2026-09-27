# ADR 0004 — FHIR R4 shaped clinical data storage

- **Status:** Accepted
- **Date:** 2026-05-04

## Context

The spec defines clinical fields as flat columns (e.g., `allergies` as a string list, `chronic_conditions` as a string list). This works for v1 but creates a one-way door:

- Every hospital integration (Epic, Cerner, Athena) speaks **FHIR R4** as the lowest common denominator.
- An eventual buyer may run a HAPI FHIR or Medplum cluster and want our data dropped in.
- AI extraction results from Claude are naturally structured — flattening them to strings discards information we paid for.

## Decision

Store clinical entities as FHIR R4 resources in `jsonb` columns alongside relational scaffolding:

| Field | Storage |
|---|---|
| `patient_profiles.allergies_fhir` | `jsonb`, array of `AllergyIntolerance` |
| `patient_profiles.chronic_conditions_fhir` | `jsonb`, array of `Condition` |
| `medical_records.extracted_fhir` | `jsonb`, FHIR `Bundle` of extracted resources |
| `medications.medication_fhir` | `jsonb`, `MedicationRequest` |

We keep flat columns for high-cardinality query needs (date filters, joins). Anything that's "describe this clinical thing" goes to FHIR.

We do NOT install a FHIR server in v1. We do NOT bundle `@types/fhir` (300+ resource types — bloat). Instead, `packages/shared/src/fhir/` defines the ~7 resource types we actually use.

## Validation

A future migration adds Postgres `CHECK` constraints validating the JSONB against a JSON schema. For now, validation is at the API layer (Zod schemas in `packages/shared`).

## Consequences

- Adds ~10% engineering overhead vs flat columns.
- Pays back the first time a clinic asks "can you export to our EHR?" — answer is yes, in days not months.
- Index strategy: GIN indexes on jsonb fields for the common queries (`@>` containment).
- Searching across FHIR fields is slower than column searches; we accept this for v1.

## Rejected alternatives

- **Run HAPI FHIR as the storage layer** — overkill for v1. Adds Java service, REST hop, and operational load before we know which features are used.
- **Keep flat columns and migrate later** — migrations of clinical data after launch are nightmare-tier; better to take the hit now.
