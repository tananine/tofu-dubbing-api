export const ErrorCodes = {
  EMAIL_ALREADY_EXISTS: 'emailAlreadyExists',
  INVALID_CREDENTIALS: 'invalidCredentials',
  ALREADY_HAVE_SUBSCRIPTION: 'alreadyHaveSubscription',
  NO_ACTIVE_SUBSCRIPTION: 'noActiveSubscription',
  SUBSCRIPTION_ALREADY_CANCELLED: 'subscriptionAlreadyCancelled',
  NO_CANCELLABLE_SUBSCRIPTION: 'noCancellableSubscription',
  VIDEO_TOO_LONG_FOR_FREE: 'videoTooLongForFree',
  AI_NOT_FOR_FREE: 'aiNotForFree',
  SUBSCRIPTION_CANCELLED: 'subscriptionCancelled',
  SUBSCRIPTION_REACTIVATED: 'subscriptionReactivated',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
