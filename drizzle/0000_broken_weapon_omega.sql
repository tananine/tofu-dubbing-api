CREATE TYPE "public"."LicenseStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "Device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licenseId" uuid NOT NULL,
	"deviceId" varchar(255) NOT NULL,
	"deviceName" varchar(255),
	"browserInfo" varchar(255),
	"ipAddress" varchar(45),
	"metadata" json,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"activatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LicenseLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licenseId" uuid,
	"action" varchar(100) NOT NULL,
	"licenseKey" varchar(255),
	"stripePaymentId" varchar(255),
	"deviceId" varchar(255),
	"ipAddress" varchar(45),
	"userAgent" text,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "License" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licenseKey" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"stripePaymentId" varchar(255),
	"stripeCustomerId" varchar(255),
	"status" "LicenseStatus" DEFAULT 'ACTIVE' NOT NULL,
	"maxDevices" integer DEFAULT 2 NOT NULL,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone,
	CONSTRAINT "License_licenseKey_unique" UNIQUE("licenseKey"),
	CONSTRAINT "License_stripePaymentId_unique" UNIQUE("stripePaymentId")
);
--> statement-breakpoint
ALTER TABLE "Device" ADD CONSTRAINT "Device_licenseId_License_id_fk" FOREIGN KEY ("licenseId") REFERENCES "public"."License"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LicenseLog" ADD CONSTRAINT "LicenseLog_licenseId_License_id_fk" FOREIGN KEY ("licenseId") REFERENCES "public"."License"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_license_device_idx" ON "Device" USING btree ("licenseId","deviceId");--> statement-breakpoint
CREATE INDEX "device_license_idx" ON "Device" USING btree ("licenseId");--> statement-breakpoint
CREATE INDEX "device_device_id_idx" ON "Device" USING btree ("deviceId");--> statement-breakpoint
CREATE INDEX "log_license_idx" ON "LicenseLog" USING btree ("licenseId");--> statement-breakpoint
CREATE INDEX "log_action_idx" ON "LicenseLog" USING btree ("action");--> statement-breakpoint
CREATE INDEX "log_created_at_idx" ON "LicenseLog" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "license_key_status_idx" ON "License" USING btree ("licenseKey","status");--> statement-breakpoint
CREATE INDEX "license_email_idx" ON "License" USING btree ("email");--> statement-breakpoint
CREATE INDEX "license_stripe_payment_idx" ON "License" USING btree ("stripePaymentId");