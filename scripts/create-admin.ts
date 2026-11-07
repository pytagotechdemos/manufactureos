/**
 * Creates (or updates) a Better Auth administrator account.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... pnpm exec tsx scripts/create-admin.ts
 *
 * Signup is disabled in the application (closed registration), so the first
 * operator account has to be provisioned out-of-band through this script.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address");
  }
  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
  }

  const hashed = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "admin", status: "ACTIVE", emailVerified: true, banned: false },
    create: {
      id: randomUUID(),
      name: "Administrator",
      email,
      emailVerified: true,
      status: "ACTIVE",
      role: "admin",
      banned: false,
    },
  });

  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashed, updatedAt: new Date() },
    });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
      },
    });
  }

  console.log(`✅ Admin ready: ${email} (role=${user.role}, status=${user.status})`);
}

main()
  .catch((error) => {
    console.error("❌ create-admin failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
