-- CreateEnum
CREATE TYPE "PainLevel" AS ENUM ('NONE', 'MILD', 'MODERATE', 'SEVERE');

-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "painLevel" "PainLevel",
ADD COLUMN     "rir" INTEGER;
