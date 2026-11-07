import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is not configured");
}

export const auth = betterAuth({
  appName: "ManufactureOS",
  baseURL,
  secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [admin()],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    // Every identity column in our schema is `@db.Uuid`; Better Auth's default
    // id generator emits 32-char base64url strings that Postgres rejects.
    database: {
      generateId: "uuid",
    },
  },
  user: {
    additionalFields: {
      status: {
        type: "string",
        required: false,
        defaultValue: "INVITED",
        input: false,
      },
    },
  },
});
