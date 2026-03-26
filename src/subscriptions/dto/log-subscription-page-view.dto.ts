import { IsEnum } from 'class-validator';

export enum SubscriptionPageView {
  PRICING = 'pricing',
  SUBSCRIPTION = 'subscription',
}

export class LogSubscriptionPageViewDto {
  @IsEnum(SubscriptionPageView)
  page!: SubscriptionPageView;
}
