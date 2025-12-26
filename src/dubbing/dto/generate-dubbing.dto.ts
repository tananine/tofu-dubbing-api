import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
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
  @IsString()
  model!: string;

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
