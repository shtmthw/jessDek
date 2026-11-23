-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('PENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "InviteState" AS ENUM ('PENDING', 'DECLINED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "requestRespondedAt" TIMESTAMP(3),
ADD COLUMN     "requestSentAt" TIMESTAMP(3),
ADD COLUMN     "requestState" "RequestState",
ADD COLUMN     "requestedById" TEXT;

-- CreateTable
CREATE TABLE "GroupInvite" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "state" "InviteState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE INDEX "GroupInvite_userId_state_idx" ON "GroupInvite"("userId", "state");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
