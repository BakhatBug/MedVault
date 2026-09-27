-- Consolidation migration: captures everything added after the initial schema
-- via `prisma db push` during v0.6 (emergency QR), v0.7 (medications CRUD),
-- v0.8 (drug interaction checker), and v0.11 (caregivers).
--
-- Postgres 16 supports adding multiple enum values in a single transaction,
-- which is the only thing Prisma's diff warns about. None of the values added
-- below are referenced by data inserts in this migration, so the
-- "new value used in same transaction" restriction doesn't apply.

-- ─── Emergency audit actions (v0.6) ─────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE 'EMERGENCY_VIEW';
ALTER TYPE "AuditAction" ADD VALUE 'EMERGENCY_DISCLOSURE_UPDATED';

-- ─── Medication audit actions (v0.7) ────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DISCONTINUED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DELETED';

-- ─── Caregiver audit actions (v0.11) ────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE 'CAREGIVER_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'CAREGIVER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'CAREGIVER_DECLINED';
ALTER TYPE "AuditAction" ADD VALUE 'CAREGIVER_REVOKED';

-- ─── Drug interaction check cache (v0.8) ────────────────────────────────────
CREATE TABLE "drug_interaction_checks" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "medications_hash" TEXT NOT NULL,
    "interactions" JSONB NOT NULL DEFAULT '[]',
    "model_id" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_interaction_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drug_interaction_checks_patient_id_created_at_idx" ON "drug_interaction_checks"("patient_id", "created_at");

CREATE UNIQUE INDEX "drug_interaction_checks_patient_id_medications_hash_key" ON "drug_interaction_checks"("patient_id", "medications_hash");

ALTER TABLE "drug_interaction_checks" ADD CONSTRAINT "drug_interaction_checks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
