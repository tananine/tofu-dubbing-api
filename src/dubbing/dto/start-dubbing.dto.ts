import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartDubbingDto {
  @IsString()
  sourceLanguage!: string;

  @IsString()
  targetLanguage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;
}
