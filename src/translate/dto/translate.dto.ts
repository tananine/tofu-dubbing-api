import { IsNotEmpty, IsString } from 'class-validator';

export class TranslateDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsNotEmpty()
  sourceLanguage!: string;

  @IsString()
  @IsNotEmpty()
  targetLanguage!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;
}
