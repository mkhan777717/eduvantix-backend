-- ============================================================
-- Job Assistance: Create JobApplication table
-- Run this directly on your PostgreSQL database.
-- This does NOT require a Prisma schema change.
-- ============================================================

-- Create enums (safe: only adds if not already present)
DO $$ BEGIN
  CREATE TYPE "JobType" AS ENUM ('INTERNSHIP', 'FULL_TIME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobAppStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SLOT_PENDING',
    'SLOT_CONFIRMED',
    'SLOT_REJECTED',
    'COMPLETED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the table
CREATE TABLE IF NOT EXISTS "JobApplication" (
  "id"              SERIAL PRIMARY KEY,
  "userId"          INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "fullName"        TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "mobile"          TEXT NOT NULL,
  "jobType"         "JobType" NOT NULL,
  "jobRole"         TEXT NOT NULL,
  "resumeFileName"  TEXT NOT NULL,
  "resumePath"      TEXT NOT NULL,
  "status"          "JobAppStatus" NOT NULL DEFAULT 'PENDING',
  "currentStep"     INTEGER NOT NULL DEFAULT 1,
  "preferredSlot"   TEXT,
  "confirmedSlot"   TEXT,
  "interviewerName" TEXT,
  "interviewerEmail" TEXT,
  "mentorFeedback"  TEXT,
  "isForwarded"     BOOLEAN NOT NULL DEFAULT false,
  "adminNote"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "JobApplication_userId_idx" ON "JobApplication"("userId");
CREATE INDEX IF NOT EXISTS "JobApplication_status_idx" ON "JobApplication"("status");

CREATE OR REPLACE FUNCTION update_job_application_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_application_updated_at ON "JobApplication";
CREATE TRIGGER job_application_updated_at
  BEFORE UPDATE ON "JobApplication"
  FOR EACH ROW
  EXECUTE FUNCTION update_job_application_updated_at();
