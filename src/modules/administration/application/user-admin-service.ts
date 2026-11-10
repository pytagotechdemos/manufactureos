import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  password: z.string().min(12),
  roleId: z.string().uuid(),
});

export class UserAdminError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

export class UserAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, permissions: { select: { permission: { select: { code: true } } } } },
    });
  }

  async list() {
    return this.prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, status: true, createdAt: true, userRoles: { select: { role: { select: { code: true, name: true } } } } },
    });
  }

  async create(actorId: string, input: unknown) {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) throw new UserAdminError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    const hashed = await hashPassword(value.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({ where: { email: value.email }, select: { id: true } });
        if (existing) throw new UserAdminError("CONFLICT", "Email already registered");
        const role = await transaction.role.findUnique({ where: { id: value.roleId }, select: { id: true } });
        if (!role) throw new UserAdminError("NOT_FOUND", "Role not found");

        const user = await transaction.user.create({
          data: {
            id: randomUUID(),
            name: value.name,
            email: value.email,
            status: "ACTIVE",
            emailVerified: true,
            banned: false,
          },
        });
        await transaction.account.create({
          data: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hashed },
        });
        await transaction.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "user.created",
            entityType: "User",
            entityId: user.id,
            source: "administration",
            metadata: { email: user.email, roleId: role.id },
          },
        });
        return { id: user.id, name: user.name, email: user.email, status: user.status };
      });
    } catch (error) {
      if (error instanceof UserAdminError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UserAdminError("CONFLICT", "Email already registered");
      }
      throw error;
    }
  }

  async setStatus(actorId: string, userId: string, status: "ACTIVE" | "DISABLED") {
    if (actorId === userId && status === "DISABLED") {
      throw new UserAdminError("INVALID_INPUT", "Tidak dapat menonaktifkan akun sendiri");
    }
    return await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({ where: { id: userId } });
      if (!target) throw new UserAdminError("NOT_FOUND", "Pengguna tidak ditemukan");
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { status, banned: status === "DISABLED" },
        select: { id: true, name: true, email: true, status: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: status === "ACTIVE" ? "user.activated" : "user.deactivated",
          entityType: "User",
          entityId: userId,
          source: "administration",
          metadata: { email: target.email, previousStatus: target.status, newStatus: status },
        },
      });
      return updated;
    });
  }
}
