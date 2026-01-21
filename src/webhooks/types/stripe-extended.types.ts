import Stripe from 'stripe';

export interface StripeSubscriptionExtended extends Stripe.Subscription {
  current_period_start: number;
  current_period_end: number;
}

export interface StripeInvoiceExtended extends Stripe.Invoice {
  subscription?: string | Stripe.Subscription;
}

export interface ExtractedSubscriptionData {
  priceId?: string;
  planInterval?: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}
