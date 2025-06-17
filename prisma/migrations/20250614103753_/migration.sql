-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "status" "ComplaintStatus" NOT NULL DEFAULT 'UNDER_REVIEW';
