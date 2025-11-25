import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class VerifyLicenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  licenseKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  fingerprint?: string;
}
