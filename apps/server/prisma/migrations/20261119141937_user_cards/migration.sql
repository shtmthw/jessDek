-- AlterTable
ALTER TABLE "User" ADD COLUMN     "card" TEXT,
ADD COLUMN     "cardShared" BOOLEAN NOT NULL DEFAULT false;
