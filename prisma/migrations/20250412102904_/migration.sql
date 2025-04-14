-- CreateTable
CREATE TABLE "Photo" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
