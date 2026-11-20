-- AlterTable: when the account saw the one-time welcome. Null: not yet (new accounts).
ALTER TABLE "User" ADD COLUMN     "welcomedAt" TIMESTAMP(3);

-- Accounts that existed before the welcome don't need it.
UPDATE "User" SET "welcomedAt" = "createdAt";
