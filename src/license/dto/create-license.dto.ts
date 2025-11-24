import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateLicenseDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(100)
  stripePaymentId: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  stripeCustomerId?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxDevices?: number;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
