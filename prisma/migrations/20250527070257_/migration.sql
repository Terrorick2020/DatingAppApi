/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `UserPlan` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_userId_key" ON "UserPlan"("userId");
