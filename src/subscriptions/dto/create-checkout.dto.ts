import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum PlanInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateCheckoutDto {
  @IsEnum(PlanInterval)
  planInterval!: PlanInterval;

  @IsOptional()
  @IsString()
  currency?: string;
}
