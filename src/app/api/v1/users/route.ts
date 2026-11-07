import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(12),
  roleId: z.string().uuid(),
});

export async function GET() {
  try {
    const access = await getCurrentUser();
    if (!access) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(access.id, "users.manage");
    return NextResponse.json({ data: await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true, createdAt: true, userRoles: { select: { role: { select: { code: true, name: true } } } } } }) });
  } catch (error) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getCurrentUser();
    if (!access) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(access.id, "users.manage");

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Email already registered" } }, { status: 409 });

    const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId }, select: { id: true } });
    if (!role) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Role not found" } }, { status: 404 });

    const hashed = await hashPassword(parsed.data.password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: randomUUID(),
          name: parsed.data.name,
          email: parsed.data.email,
          status: "ACTIVE",
          emailVerified: true,
          banned: false,
        },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: created.id,
          providerId: "credential",
          userId: created.id,
          password: hashed,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, roleId: role.id },
      });
      return created;
    });

    return NextResponse.json({ data: { id: user.id, name: user.name, email: user.email, status: user.status } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}
