import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeactivateLicenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  licenseKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;
}
