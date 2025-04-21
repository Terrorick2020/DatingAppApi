/*
  Warnings:

  - You are about to drop the column `geo` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "geo",
ADD COLUMN     "enableGeo" BOOLEAN NOT NULL DEFAULT false;
