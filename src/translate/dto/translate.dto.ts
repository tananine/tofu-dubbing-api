import { IsNotEmpty, IsString } from 'class-validator';

export class TranslateDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsNotEmpty()
  lang!: string;

  @IsString()
  @IsNotEmpty()
  targetLang!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;
}

