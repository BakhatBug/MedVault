// One-shot CLI: approve a doctor's verification.
// Usage:
//   npm run admin:approve-doctor -- <userId>
//   npm run admin:approve-doctor -- --email doc@example.com
//
// Used in v0.4 before we have an admin UI. Removes the manual SQL workaround.

import "dotenv/config";
import { PrismaClient, DoctorVerificationStatus, AuditAction } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let userId: string | null = null;
  let email: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) {
      email = args[++i] ?? null;
    } else if (!userId) {
      userId = args[i] ?? null;
    }
  }

  if (!userId && !email) {
    console.error("usage: approve-doctor.ts <userId> | --email <email>");
    process.exit(2);
  }

  const where = userId ? { id: userId } : { email: email!.toLowerCase() };
  const user = await prisma.user.findUnique({ where, include: { doctorProfile: true } });
  if (!user) {
    console.error(`user not found: ${userId ?? email}`);
    process.exit(1);
  }
  if (!user.doctorProfile) {
    console.error(`user ${user.id} is not a doctor (role=${user.role})`);
    process.exit(1);
  }

  const updated = await prisma.doctorProfile.update({
    where: { userId: user.id },
    data: {
      verificationStatus: DoctorVerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verificationNotes: "Approved via admin CLI",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.DOCTOR_VERIFIED,
      actorUserId: null,
      subjectUserId: user.id,
      metadata: { method: "admin_cli", licenseNumber: updated.licenseNumber },
    },
  });

  console.log(`approved doctor: ${updated.fullName} (userId=${user.id}) license=${updated.licenseCountry}-${updated.licenseNumber}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
