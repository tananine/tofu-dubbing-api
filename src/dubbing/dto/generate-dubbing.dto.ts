import {
  IsArray,
  IsInt,
  Min,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SubtitleItemDto {
  @IsString()
  sourceText!: string;

  @IsString()
  targetText!: string;

  @IsNumber()
  index!: number;

  @IsNumber()
  end!: number;

  @IsNumber()
  start!: number;
}

class ConfigDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  voice!: string;

  @IsString()
  voiceType!: string;

  @IsString()
  toLanguage!: string;
}

class VideoDetailsDto {
  @IsString()
  videoId!: string;

  @IsString()
  title!: string;

  @IsNumber()
  subtitleLevel!: number;
}

export class GenerateDubbingDto {
  @IsInt()
  @Min(1)
  dubbingLogId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtitleItemDto)
  subtitles!: SubtitleItemDto[];

  @ValidateNested()
  @Type(() => ConfigDto)
  config!: ConfigDto;

  @ValidateNested()
  @Type(() => VideoDetailsDto)
  videoDetails!: VideoDetailsDto;
}
