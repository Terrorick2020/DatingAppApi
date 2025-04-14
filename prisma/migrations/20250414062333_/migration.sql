-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "telegramId" BIGINT,
ALTER COLUMN "userId" DROP NOT NULL;
