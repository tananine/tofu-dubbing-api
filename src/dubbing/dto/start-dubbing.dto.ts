import { IsString } from 'class-validator';

export class StartDubbingDto {
  @IsString()
  sourceLanguage!: string;

  @IsString()
  targetLanguage!: string;
}
