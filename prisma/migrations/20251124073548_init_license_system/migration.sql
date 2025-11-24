-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripePaymentId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxDevices" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "browserInfo" TEXT,
    "osInfo" TEXT,
    "timezone" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "License_stripePaymentId_key" ON "License"("stripePaymentId");

-- CreateIndex
CREATE INDEX "License_licenseKey_status_idx" ON "License"("licenseKey", "status");

-- CreateIndex
CREATE INDEX "License_stripePaymentId_idx" ON "License"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Device_licenseId_idx" ON "Device"("licenseId");

-- CreateIndex
CREATE INDEX "Device_deviceId_idx" ON "Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_licenseId_deviceId_key" ON "Device"("licenseId", "deviceId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
