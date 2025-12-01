import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class StartDubbingDto {
  @IsString()
  @IsNotEmpty()
  videoId!: string;

  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsNumber()
  @Min(0)
  videoDuration!: number;

  @IsString()
  @IsOptional()
  sourceLanguage?: string;

  @IsString()
  @IsOptional()
  targetLanguage?: string;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiModel?: string;

  @IsString()
  @IsOptional()
  voice?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  videoVolume?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  dubbingVolume?: number;
}
