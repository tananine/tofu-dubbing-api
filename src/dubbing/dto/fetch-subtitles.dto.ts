import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class FetchSubtitlesDto {
  @IsInt()
  @Min(1)
  dubbingLogId!: number;

  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,32}$/, { message: 'invalidVideoId' })
  videoId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z-]{2,20}$/, { message: 'invalidLanguage' })
  language?: string;
}
