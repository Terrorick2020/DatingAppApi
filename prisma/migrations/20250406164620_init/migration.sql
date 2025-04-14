/*
  Warnings:

  - The values [Guest] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[telegramId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `age` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bio` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `findRequest` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sex` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telegramId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `town` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('Male', 'Female', 'All', 'None');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Pro', 'Noob', 'None', 'Blocked');

-- CreateEnum
CREATE TYPE "Request" AS ENUM ('Love', 'Sex', 'Communication', 'Friend');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('Admin', 'User', 'Psych');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'User';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "age" INTEGER NOT NULL,
ADD COLUMN     "bio" TEXT NOT NULL,
ADD COLUMN     "findRequest" "Request" NOT NULL,
ADD COLUMN     "geo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lang" TEXT NOT NULL DEFAULT 'ru',
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "sex" "Sex" NOT NULL,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'None',
ADD COLUMN     "telegramId" BIGINT NOT NULL,
ADD COLUMN     "town" TEXT NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'User';

-- CreateTable
CREATE TABLE "TelegramAccount" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tgId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "languageCode" TEXT NOT NULL DEFAULT 'ru',

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccount_tgId_key" ON "TelegramAccount"("tgId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccount_username_key" ON "TelegramAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "TelegramAccount"("tgId") ON DELETE CASCADE ON UPDATE CASCADE;
