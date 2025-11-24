/*
  Warnings:

  - You are about to drop the column `osInfo` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Device` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Device" DROP COLUMN "osInfo",
DROP COLUMN "timezone",
ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "License" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "LicenseLog" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT,
    "action" TEXT NOT NULL,
    "licenseKey" TEXT,
    "stripePaymentId" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LicenseLog_licenseId_idx" ON "LicenseLog"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseLog_action_idx" ON "LicenseLog"("action");

-- CreateIndex
CREATE INDEX "LicenseLog_createdAt_idx" ON "LicenseLog"("createdAt");

-- CreateIndex
CREATE INDEX "License_email_idx" ON "License"("email");

-- AddForeignKey
ALTER TABLE "LicenseLog" ADD CONSTRAINT "LicenseLog_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
