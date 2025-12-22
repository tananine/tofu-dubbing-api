export const ErrorCodes = {
  EMAIL_ALREADY_EXISTS: 'emailAlreadyExists',
  INVALID_CREDENTIALS: 'invalidCredentials',
  ALREADY_HAVE_SUBSCRIPTION: 'alreadyHaveSubscription',
  NO_ACTIVE_SUBSCRIPTION: 'noActiveSubscription',
  SUBSCRIPTION_ALREADY_CANCELLED: 'subscriptionAlreadyCancelled',
  NO_CANCELLABLE_SUBSCRIPTION: 'noCancellableSubscription',
  SUBSCRIPTION_CANCELLED: 'subscriptionCancelled',
  SUBSCRIPTION_REACTIVATED: 'subscriptionReactivated',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
