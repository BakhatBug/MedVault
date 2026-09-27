-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'CAREGIVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_OTP', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RESUBMIT_REQUESTED');

-- CreateEnum
CREATE TYPE "RecordCategory" AS ENUM ('LAB_RESULT', 'PRESCRIPTION', 'IMAGING', 'DISCHARGE_SUMMARY', 'CONSULTATION_NOTE', 'VACCINATION', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "AIProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AccessPermissionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessDuration" AS ENUM ('HOURS_24', 'DAYS_7', 'DAYS_30', 'PERMANENT');

-- CreateEnum
CREATE TYPE "CaregiverLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ACCESS_REQUEST', 'ACCESS_APPROVED', 'ACCESS_DENIED', 'AI_PROCESSING_DONE', 'MEDICATION_REMINDER', 'CAREGIVER_LINK_REQUEST', 'GENERIC');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTERED', 'USER_LOGIN', 'USER_LOGIN_FAILED', 'RECORD_UPLOADED', 'RECORD_VIEWED', 'RECORD_DELETED', 'ACCESS_REQUESTED', 'ACCESS_GRANTED', 'ACCESS_DENIED', 'ACCESS_REVOKED', 'AI_CALL', 'DATA_EXPORTED', 'ACCOUNT_DELETED', 'DOCTOR_VERIFIED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_OTP',
    "hipaa_tenant" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "patient_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "blood_type" TEXT,
    "gender" TEXT,
    "height_cm" DECIMAL(5,2),
    "weight_kg" DECIMAL(5,2),
    "allergies_fhir" JSONB NOT NULL DEFAULT '[]',
    "chronic_conditions_fhir" JSONB NOT NULL DEFAULT '[]',
    "emergency_contact" JSONB,
    "insurance" JSONB,
    "emergency_disclosure" JSONB NOT NULL DEFAULT '{"bloodType":true,"allergies":true,"currentMedications":true,"emergencyContact":true}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_country" TEXT NOT NULL,
    "license_doc_s3_key" TEXT,
    "specialty" TEXT,
    "hospital_affiliation" TEXT,
    "verification_status" "DoctorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "parent_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "category" "RecordCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "s3_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3),
    "extracted_fhir" JSONB,
    "ai_status" "AIProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "ai_attempts" INTEGER NOT NULL DEFAULT 0,
    "ai_last_error" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "source_record_id" UUID,
    "name" TEXT NOT NULL,
    "medication_fhir" JSONB NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "prescribing_doctor" TEXT,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_summaries" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "record_set_hash" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "model_id" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" UUID NOT NULL,
    "caller_user_id" UUID NOT NULL,
    "patient_id" UUID,
    "feature" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_access_permissions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_user_id" UUID NOT NULL,
    "status" "AccessPermissionStatus" NOT NULL DEFAULT 'REQUESTED',
    "duration" "AccessDuration",
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "request_expires_at" TIMESTAMP(3) NOT NULL,
    "request_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_access_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_links" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "caregiver_user_id" UUID NOT NULL,
    "status" "CaregiverLinkStatus" NOT NULL DEFAULT 'PENDING',
    "permissions" JSONB NOT NULL DEFAULT '{"viewRecords":true,"uploadRecords":true,"viewMedications":true,"manageDoctorAccess":false}',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "caregiver_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_timeline_events" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "record_id" UUID,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "subject_user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_user_id_key" ON "patient_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_patient_code_key" ON "patient_profiles"("patient_code");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_user_id_key" ON "doctor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "doctor_profiles_verification_status_idx" ON "doctor_profiles"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_license_country_license_number_key" ON "doctor_profiles"("license_country", "license_number");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "otp_codes_user_id_purpose_consumed_at_idx" ON "otp_codes"("user_id", "purpose", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "medical_records_s3_key_key" ON "medical_records"("s3_key");

-- CreateIndex
CREATE INDEX "medical_records_patient_id_category_deleted_at_idx" ON "medical_records"("patient_id", "category", "deleted_at");

-- CreateIndex
CREATE INDEX "medical_records_ai_status_idx" ON "medical_records"("ai_status");

-- CreateIndex
CREATE INDEX "medications_patient_id_is_active_deleted_at_idx" ON "medications"("patient_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "ai_summaries_patient_id_created_at_idx" ON "ai_summaries"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_summaries_patient_id_record_set_hash_key" ON "ai_summaries"("patient_id", "record_set_hash");

-- CreateIndex
CREATE INDEX "ai_call_logs_patient_id_created_at_idx" ON "ai_call_logs"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_caller_user_id_created_at_idx" ON "ai_call_logs"("caller_user_id", "created_at");

-- CreateIndex
CREATE INDEX "doctor_access_permissions_patient_id_status_idx" ON "doctor_access_permissions"("patient_id", "status");

-- CreateIndex
CREATE INDEX "doctor_access_permissions_doctor_user_id_status_idx" ON "doctor_access_permissions"("doctor_user_id", "status");

-- CreateIndex
CREATE INDEX "caregiver_links_caregiver_user_id_status_idx" ON "caregiver_links"("caregiver_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_links_patient_id_caregiver_user_id_key" ON "caregiver_links"("patient_id", "caregiver_user_id");

-- CreateIndex
CREATE INDEX "health_timeline_events_patient_id_occurred_at_idx" ON "health_timeline_events"("patient_id", "occurred_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_subject_user_id_created_at_idx" ON "audit_logs"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_caller_user_id_fkey" FOREIGN KEY ("caller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_access_permissions" ADD CONSTRAINT "doctor_access_permissions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_access_permissions" ADD CONSTRAINT "doctor_access_permissions_doctor_user_id_fkey" FOREIGN KEY ("doctor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_links" ADD CONSTRAINT "caregiver_links_caregiver_user_id_fkey" FOREIGN KEY ("caregiver_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_timeline_events" ADD CONSTRAINT "health_timeline_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_timeline_events" ADD CONSTRAINT "health_timeline_events_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
