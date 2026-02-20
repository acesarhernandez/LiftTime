-- CreateEnum
CREATE TYPE "TrainingMode" AS ENUM ('BEGINNER', 'ADVANCED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "trainingMode" "TrainingMode" NOT NULL DEFAULT 'BEGINNER';
