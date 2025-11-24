import { IsEnum, IsOptional, IsString, IsInt, Min, IsDateString } from 'class-validator';

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

export class UpdateLicenseStatusDto {
  @IsEnum(LicenseStatus)
  status: LicenseStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateLicenseExpiryDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class UpdateMaxDevicesDto {
  @IsInt()
  @Min(1)
  maxDevices: number;
}

export class CreateLicenseDto {
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  stripePaymentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDevices?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

