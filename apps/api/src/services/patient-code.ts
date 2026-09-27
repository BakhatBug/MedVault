import { formatPatientCode } from "@medivault/shared";
import type { Prisma } from "@prisma/client";

// Allocate the next public patient identifier from the patient_code_seq sequence.
// Must be called inside a transaction with the create() of patient_profiles so
// the sequence advance and the row insert commit together.
export async function allocatePatientCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('patient_code_seq')`;
  const seqRow = rows[0];
  if (!seqRow) {
    throw new Error("patient_code_seq returned no rows");
  }
  return formatPatientCode(new Date().getUTCFullYear(), Number(seqRow.nextval));
}
