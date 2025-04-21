/*
  Warnings:

  - You are about to drop the column `userId` on the `Chats` table. All the data in the column will be lost.
  - Added the required column `lastMsg` to the `Chats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user1Id` to the `Chats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user2Id` to the `Chats` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Chats" DROP CONSTRAINT "Chats_userId_fkey";

-- AlterTable
ALTER TABLE "Chats" DROP COLUMN "userId",
ADD COLUMN     "lastMsg" TEXT NOT NULL,
ADD COLUMN     "user1Id" TEXT NOT NULL,
ADD COLUMN     "user2Id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Chats" ADD CONSTRAINT "Chats_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chats" ADD CONSTRAINT "Chats_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;
