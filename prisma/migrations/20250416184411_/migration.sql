/*
  Warnings:

  - The values [None] on the enum `Status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `userId` on the `Photo` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Status_new" AS ENUM ('Pro', 'Noob', 'Blocked');
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "Status_new" USING ("status"::text::"Status_new");
ALTER TYPE "Status" RENAME TO "Status_old";
ALTER TYPE "Status_new" RENAME TO "Status";
DROP TYPE "Status_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'Noob';
COMMIT;

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_userId_fkey";

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "id",
ALTER COLUMN "status" SET DEFAULT 'Noob',
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("telegramId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;
