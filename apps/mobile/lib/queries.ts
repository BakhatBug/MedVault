import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// ──────────────────────────────────────────────────────────────────────────────
// Response types — shape what /v1 returns
// ──────────────────────────────────────────────────────────────────────────────

export type RecordSummary = {
  id: string;
  category: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  recordedAt: string | null;
  aiStatus: string;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  startDate: string | null;
  endDate: string | null;
  prescribingDoctor: string | null;
  isActive: boolean;
  reminderEnabled: boolean;
};

export type TimelineEvent = {
  id: string;
  type:
    | "record_uploaded"
    | "diagnosis"
    | "lab_result"
    | "vaccination"
    | "allergy_recorded"
    | "medication_started"
    | "medication_discontinued";
  occurredAt: string;
  title: string;
  description?: string;
  linkedRecordId?: string;
  linkedMedicationId?: string;
  category?: string;
};

export type InteractionsResponse =
  | { status: "no_check_yet"; disclaimer: string }
  | {
      generatedAt: string;
      modelId: string;
      medicationsHash: string;
      medications: Array<{ name: string; dosage: string | null }>;
      interactions: Array<{
        medications: string[];
        severity: "minor" | "moderate" | "major";
        description: string;
      }>;
      cached: boolean;
      disclaimer: string;
    };

export type RecordDetail = {
  id: string;
  category: string;
  title: string;
  notes?: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  recordedAt?: string | null;
  aiStatus: string;
  extractedFhir?: {
    resourceType?: string;
    entry?: Array<{
      resource?: {
        resourceType?: string;
        code?: { text?: string; coding?: Array<{ display?: string; code?: string }> };
        medicationCodeableConcept?: { text?: string; coding?: Array<{ display?: string; code?: string }> };
        dosageInstruction?: Array<{ text?: string; doseAndRate?: Array<{ doseQuantity?: { value?: number; unit?: string } }> }>;
        valueQuantity?: { value?: number; unit?: string };
        valueString?: string;
        referenceRange?: Array<{ text?: string; low?: { value?: number; unit?: string }; high?: { value?: number; unit?: string } }>;
        interpretation?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
        clinicalStatus?: { coding?: Array<{ code?: string }> };
        verificationStatus?: { coding?: Array<{ code?: string }> };
        severity?: { coding?: Array<{ display?: string }> };
        onsetDateTime?: string;
        recordedDate?: string;
        effectiveDateTime?: string;
        note?: Array<{ text?: string }>;
        [key: string]: unknown;
      };
    }>;
    [key: string]: unknown;
  } | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useRecords(category?: string) {
  return useQuery({
    queryKey: ["records", { category }],
    queryFn: () =>
      api<{ items: RecordSummary[]; nextCursor: string | null }>(
        `/records${category && category !== "ALL" ? `?category=${category}` : ""}`,
      ),
  });
}

export function useRecordDetail(recordId: string | null) {
  return useQuery({
    queryKey: ["records", recordId],
    queryFn: () => api<RecordDetail>(`/records/${recordId}`),
    enabled: !!recordId,
  });
}

export function useRecordViewUrl(recordId: string | null) {
  return useQuery({
    queryKey: ["records", recordId, "view-url"],
    queryFn: () => api<{ url: string; expiresInSeconds: number }>(`/records/${recordId}/view-url`),
    enabled: !!recordId,
  });
}

export function useMedications(includeInactive = false) {
  return useQuery({
    queryKey: ["medications", { includeInactive }],
    queryFn: () =>
      api<{ items: Medication[]; nextCursor: string | null }>(
        `/medications${includeInactive ? "?includeInactive=true" : ""}`,
      ),
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: ["timeline"],
    queryFn: () =>
      api<{ items: TimelineEvent[]; total: number; hasMore: boolean }>("/me/timeline?limit=50"),
  });
}

export function useInteractions() {
  return useQuery({
    queryKey: ["interactions"],
    queryFn: () => api<InteractionsResponse>("/me/drug-interactions"),
  });
}

// Emergency disclosure — which fields appear in the public QR view.
export type EmergencyDisclosure = {
  bloodType: boolean;
  allergies: boolean;
  currentMedications: boolean;
  emergencyContact: boolean;
};

export function useEmergencyDisclosure() {
  return useQuery({
    queryKey: ["emergency-disclosure"],
    queryFn: () => api<{ disclosure: EmergencyDisclosure }>("/me/emergency-disclosure"),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Doctor-side queries — patient code is the path key. All require an active
// access permission on the backend.
// ──────────────────────────────────────────────────────────────────────────────

export type PatientProfile = {
  id: string;
  patientCode: string;
  fullName: string;
  dateOfBirth: string;
  bloodType: string | null;
  gender: string | null;
  heightCm: string | null;
  weightKg: string | null;
  allergiesFhir: unknown;
  chronicConditionsFhir: unknown;
  emergencyContact: unknown;
};

export type AccessPermission = {
  id: string;
  status: "REQUESTED" | "APPROVED" | "DENIED" | "EXPIRED" | "REVOKED";
  duration: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  requestExpiresAt: string;
  createdAt: string;
  patient: { patientCode: string; fullName: string };
};

// ──────────────────────────────────────────────────────────────────────────────
// Patient-side: managing incoming doctor access requests
// ──────────────────────────────────────────────────────────────────────────────

export type IncomingAccess = {
  id: string;
  status: "REQUESTED" | "APPROVED" | "DENIED" | "EXPIRED" | "REVOKED";
  duration: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  requestExpiresAt: string;
  requestNote: string | null;
  createdAt: string;
  doctor: {
    id: string;
    doctorProfile: {
      fullName: string;
      specialty: string | null;
      hospitalAffiliation: string | null;
    } | null;
  };
};

export type AccessDurationChoice = "HOURS_24" | "DAYS_7" | "DAYS_30" | "PERMANENT";

export function useIncomingAccess() {
  return useQuery({
    queryKey: ["access", "incoming"],
    queryFn: () => api<{ items: IncomingAccess[] }>("/access/incoming"),
  });
}

export function useApproveAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; duration: AccessDurationChoice }) =>
      api(`/access/${input.id}/approve`, {
        method: "POST",
        body: { duration: input.duration },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access", "incoming"] }),
  });
}

export function useDenyAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/access/${id}/deny`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access", "incoming"] }),
  });
}

export function useRevokeIncomingAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/access/${id}/revoke`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access", "incoming"] }),
  });
}

export function useOutgoingAccess() {
  return useQuery({
    queryKey: ["access", "outgoing"],
    queryFn: () => api<{ items: AccessPermission[] }>("/access/outgoing"),
  });
}

export function useRequestAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { patientCode: string; note?: string }) =>
      api<{ id: string; patientId: string; requestExpiresAt: string }>("/access/request", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access", "outgoing"] }),
  });
}

export function usePatientForDoctor(patientCode: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode],
    queryFn: () => api<PatientProfile>(`/patients/${patientCode}`),
    enabled: !!patientCode,
  });
}

export function usePatientRecords(patientCode: string | null, category?: string) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "records", { category }],
    queryFn: () =>
      api<{ items: RecordSummary[]; nextCursor: string | null }>(
        `/patients/${patientCode}/records${category && category !== "ALL" ? `?category=${category}` : ""}`,
      ),
    enabled: !!patientCode,
  });
}

export function useDoctorRecordDetail(patientCode: string | null, recordId: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "records", recordId],
    queryFn: () => api<RecordDetail>(`/patients/${patientCode}/records/${recordId}`),
    enabled: !!patientCode && !!recordId,
  });
}

export function useDoctorRecordViewUrl(patientCode: string | null, recordId: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "records", recordId, "view-url"],
    queryFn: () => api<{ url: string; expiresInSeconds: number }>(`/patients/${patientCode}/records/${recordId}/view-url`),
    enabled: !!patientCode && !!recordId,
  });
}

export function usePatientMedications(patientCode: string | null, includeInactive = true) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "medications", { includeInactive }],
    queryFn: () =>
      api<{ items: Medication[]; nextCursor: string | null }>(
        `/patients/${patientCode}/medications${includeInactive ? "?includeInactive=true" : ""}`,
      ),
    enabled: !!patientCode,
  });
}

export function usePatientTimeline(patientCode: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "timeline"],
    queryFn: () =>
      api<{ items: TimelineEvent[]; total: number; hasMore: boolean }>(
        `/patients/${patientCode}/timeline?limit=50`,
      ),
    enabled: !!patientCode,
  });
}

export function usePatientInteractions(patientCode: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "interactions"],
    queryFn: () => api<InteractionsResponse>(`/patients/${patientCode}/drug-interactions`),
    enabled: !!patientCode,
  });
}

export function usePatientSummary(patientCode: string | null) {
  return useQuery({
    queryKey: ["doctor", "patient", patientCode, "summary"],
    queryFn: () =>
      api<{
        id?: string;
        summary?: string;
        summaryText?: string;
        flags: unknown[];
        generatedAt: string;
        modelId: string;
        disclaimer: string;
        cached: boolean;
      }>(`/patients/${patientCode}/summary`),
    enabled: !!patientCode,
  });
}

export function useRefreshPatientSummary(patientCode: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{
        id?: string;
        summary?: string;
        summaryText?: string;
        flags: unknown[];
        generatedAt: string;
        modelId: string;
        disclaimer: string;
        cached: boolean;
      }>(`/patients/${patientCode}/summary?refresh=true`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doctor", "patient", patientCode, "summary"] }),
  });
}

export function useAskAi() {
  return useMutation({
    mutationFn: (input: { patientCode: string; question: string }) =>
      api<{
        answer: string;
        modelId: string;
        generatedAt: string;
        tokens: { input: number; output: number };
        disclaimer: string;
      }>(`/patients/${input.patientCode}/ask`, {
        method: "POST",
        body: { question: input.question },
      }),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Caregiver-side queries
// ──────────────────────────────────────────────────────────────────────────────

export type CaregiverLink = {
  id: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  permissions: Record<string, unknown>;
  patient: { patientCode: string; fullName: string };
};

export function useCaregiverLinks() {
  return useQuery({
    queryKey: ["caregiver", "incoming"],
    queryFn: () => api<{ items: CaregiverLink[] }>("/caregivers/incoming"),
  });
}

export function useAcceptCaregiverLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/caregivers/${id}/accept`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["caregiver", "incoming"] }),
  });
}

export function useDeclineCaregiverLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/caregivers/${id}/decline`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["caregiver", "incoming"] }),
  });
}

export function useRevokeCaregiverLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/caregivers/${id}/revoke`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["caregiver", "incoming"] }),
  });
}

export function useCaregiverPatientRecords(patientCode: string | null) {
  return useQuery({
    queryKey: ["caregiver", "patient", patientCode, "records"],
    queryFn: () =>
      api<{ items: RecordSummary[]; nextCursor: string | null }>(
        `/caregivers/patients/${patientCode}/records`,
      ),
    enabled: !!patientCode,
  });
}

export function useUpdateEmergencyDisclosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<EmergencyDisclosure>) =>
      api<{ disclosure: EmergencyDisclosure }>("/me/emergency-disclosure", {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["emergency-disclosure"], res);
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Patient-side AI Assistant & Health Summary
export type SummaryFlag = {
  kind: "drug_interaction" | "lab_trend" | "missed_followup" | "allergy_conflict" | "other";
  severity: "low" | "moderate" | "high";
  text: string;
};

export function useMyHealthSummary(opts?: { refresh?: boolean }) {
  return useQuery({
    queryKey: ["me", "summary", opts?.refresh],
    queryFn: () =>
      api<{
        id: string;
        summaryText: string;
        flags: SummaryFlag[];
        modelId: string;
        generatedAt: string;
        cached: boolean;
        disclaimer: string;
      }>(`/me/summary${opts?.refresh ? "?refresh=true" : ""}`),
  });
}

export function usePatientAskAi() {
  return useMutation({
    mutationFn: (input: { question: string }) =>
      api<{
        answer: string;
        modelId: string;
        generatedAt: string;
        tokens: { input: number; output: number };
        disclaimer: string;
      }>("/me/ask", {
        method: "POST",
        body: { question: input.question },
      }),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Doctor-side Patient Search by Name or ID
// ──────────────────────────────────────────────────────────────────────────────

export type SearchPatientResult = {
  patientCode: string;
  fullName: string;
  gender: string | null;
  hasActiveAccess: boolean;
  hasPendingAccess: boolean;
};

export function useSearchPatients(query: string) {
  return useQuery({
    queryKey: ["access", "search-patients", query],
    queryFn: () =>
      api<{ items: SearchPatientResult[] }>(`/access/search-patients?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 1,
  });
}

