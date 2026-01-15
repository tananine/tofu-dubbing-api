import { IsString } from 'class-validator';

export class VoiceListRequestDto {
  @IsString()
  voiceType!: string;
}
