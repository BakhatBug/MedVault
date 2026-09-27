# ADR 0001 — Build from scratch vs fork an existing EMR/PHR system

- **Status:** Accepted
- **Date:** 2026-05-04

## Context

MediVault overlaps in surface area with several open-source medical-records projects. Before writing code, we evaluated whether to fork one.

| System | Type | Language | Fit |
|---|---|---|---|
| OpenEMR | Clinic EHR | PHP | Practice-management heavy; clinic-owned data model |
| OpenMRS | Hospital EHR | Java | Designed for global-health field deployments; module-heavy |
| HospitalRun | Offline EHR | JS | Project largely dormant since 2022 |
| LibreHealth | EHR fork | PHP | Same shape problems as OpenEMR |
| Bahmni | EHR distribution | Java | Bundles OpenMRS + OpenERP; very heavy |
| GNU Health | Hospital + Lab | Python | Tryton-based; clinic-side |
| CommonHealth (OHF) | Patient PHR | Kotlin (Android) | Right *shape* but Android-only and read-only of provider data |
| Apple HealthKit / Google Health Connect | OS-level PHR APIs | Native | Distribution + ingestion path, not a system to fork |

## Decision

**Build from scratch.** Borrow patterns from CommonHealth and FHIR R4 reference implementations.

## Consequences

- We avoid fighting an EHR codebase whose data model (clinic-owned, encounter-centric) is the opposite of our patient-owned model.
- We pay the upfront cost of building auth, records, and access control ourselves.
- We integrate FHIR R4 shapes from day one (see [ADR 0004](./0004-fhir-shaped-storage.md)) so a hospital integration in v2 doesn't require a data migration.
- We treat Apple HealthKit / Google Health Connect as **integration channels** in a later phase, not as platforms to build on.

## Alternatives considered

- **Fork OpenEMR** — rejected: PHP stack doesn't match our React Native + AWS path; the patient-controlled access model would require gutting most of OpenEMR's authorization layer.
- **Build on top of HAPI FHIR** — rejected for v1 because it adds a Java service to operate before we have product-market fit. Reconsider in v2 once we know which clinical-server features we actually need.
