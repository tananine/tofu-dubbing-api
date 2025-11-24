import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class DeviceInfo {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  browser?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  os?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;
}

export class ActivateLicenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  licenseKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfo)
  deviceInfo?: DeviceInfo;
}
