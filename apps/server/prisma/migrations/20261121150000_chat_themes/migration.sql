-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "theme" TEXT,
ADD COLUMN     "themeSetAt" TIMESTAMP(3),
ADD COLUMN     "themeSetById" TEXT;

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "color" TEXT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_themeSetById_fkey" FOREIGN KEY ("themeSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

