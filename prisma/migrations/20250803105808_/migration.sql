-- CreateEnum
CREATE TYPE "public"."PsychologistStatus" AS ENUM ('Active', 'Inactive', 'Blocked');

-- CreateTable
CREATE TABLE "public"."Psychologist" (
    "id" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "status" "public"."PsychologistStatus" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Psychologist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PsychologistPhoto" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "tempTgId" TEXT,
    "telegramId" TEXT,

    CONSTRAINT "PsychologistPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PsychologistInvite" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "usedByTelegramId" TEXT,

    CONSTRAINT "PsychologistInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Psychologist_telegramId_key" ON "public"."Psychologist"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "PsychologistInvite_code_key" ON "public"."PsychologistInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PsychologistInvite_usedByTelegramId_key" ON "public"."PsychologistInvite"("usedByTelegramId");

-- AddForeignKey
ALTER TABLE "public"."PsychologistPhoto" ADD CONSTRAINT "PsychologistPhoto_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "public"."Psychologist"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PsychologistInvite" ADD CONSTRAINT "PsychologistInvite_usedByTelegramId_fkey" FOREIGN KEY ("usedByTelegramId") REFERENCES "public"."Psychologist"("telegramId") ON DELETE SET NULL ON UPDATE CASCADE;
