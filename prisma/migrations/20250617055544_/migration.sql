-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('Male', 'Female', 'All', 'None');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Admin', 'User', 'Psych');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Pro', 'Noob', 'Blocked');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "telegramId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ru',
    "name" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "sex" "Sex" NOT NULL,
    "selSex" "Sex" NOT NULL,
    "age" INTEGER NOT NULL,
    "bio" TEXT NOT NULL,
    "enableGeo" BOOLEAN NOT NULL DEFAULT false,
    "isVerify" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "interestId" INTEGER,
    "role" "Role" NOT NULL DEFAULT 'User',
    "status" "Status" NOT NULL DEFAULT 'Noob',
    "referralCode" TEXT,
    "invitedById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "UserPlan" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" INTEGER NOT NULL,
    "planDescription" TEXT NOT NULL,
    "regionId" INTEGER NOT NULL,
    "regionnDescription" TEXT NOT NULL,

    CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isOppos" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plans" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cityes" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Regions" (
    "id" SERIAL NOT NULL,
    "cityId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "tempTgId" TEXT,
    "telegramId" TEXT,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintGlobVars" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ComplaintGlobVars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintDescVars" (
    "id" SERIAL NOT NULL,
    "globId" INTEGER NOT NULL,
    "globVal" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ComplaintDescVars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintReason" (
    "id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ComplaintReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonId" INTEGER NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'UNDER_REVIEW',

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "isMatch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_userId_key" ON "UserPlan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_value_key" ON "Interest"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Plans_value_key" ON "Plans"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Cityes_id_key" ON "Cityes"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Cityes_value_key" ON "Cityes"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Cityes_label_key" ON "Cityes"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Regions_cityId_value_key" ON "Regions"("cityId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintGlobVars_value_key" ON "ComplaintGlobVars"("value");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintDescVars_value_key" ON "ComplaintDescVars"("value");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintReason_value_key" ON "ComplaintReason"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Like_fromUserId_toUserId_key" ON "Like"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("telegramId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regions" ADD CONSTRAINT "Regions_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cityes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintDescVars" ADD CONSTRAINT "ComplaintDescVars_globId_fkey" FOREIGN KEY ("globId") REFERENCES "ComplaintGlobVars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ComplaintReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("telegramId") ON DELETE CASCADE ON UPDATE CASCADE;
