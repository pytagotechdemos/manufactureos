ALTER TABLE "users"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "banReason" TEXT,
  ADD COLUMN "banExpires" TIMESTAMP(3);

ALTER TABLE "sessions"
  ADD COLUMN "impersonatedBy" TEXT;
