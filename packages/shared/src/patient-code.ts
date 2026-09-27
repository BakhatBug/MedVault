// Patient code generation per spec §4.1 — format: MVK-YYYY-NNNNN.
//
// Implementation note: the actual sequence allocation MUST happen in the database
// (a Postgres sequence) so concurrent registrations don't collide. This helper
// only formats the pieces. The migration that creates the sequence will land in v0.2.

const PATIENT_CODE_PREFIX = "MVK";

export function formatPatientCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2025 || year > 2100) {
    throw new RangeError(`patient code year out of range: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`patient code sequence must be a positive integer`);
  }
  return `${PATIENT_CODE_PREFIX}-${year}-${String(sequence).padStart(5, "0")}`;
}

export function parsePatientCode(code: string): { year: number; sequence: number } | null {
  const match = /^MVK-(\d{4})-(\d{5,})$/.exec(code);
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}
