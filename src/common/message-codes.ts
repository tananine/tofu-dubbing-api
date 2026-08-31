export const MessageCodes = {
  EMAIL_ALREADY_EXISTS: 'emailAlreadyExists',
  INVALID_CREDENTIALS: 'invalidCredentials',
  ALREADY_HAVE_SUBSCRIPTION: 'alreadyHaveSubscription',
  NO_ACTIVE_SUBSCRIPTION: 'noActiveSubscription',
  SUBSCRIPTION_ALREADY_CANCELLED: 'subscriptionAlreadyCancelled',
  NO_CANCELLABLE_SUBSCRIPTION: 'noCancellableSubscription',
  SUBSCRIPTION_CANCELLED: 'subscriptionCancelled',
  SUBSCRIPTION_REACTIVATED: 'subscriptionReactivated',
  PRO_SUBSCRIPTION_REQUIRED: 'proSubscriptionRequired',
  AI_MODEL_REQUIRES_PRO: 'aiModelRequiresPro',
  WEBHOOK_SECRET_NOT_CONFIGURED: 'webhookSecretNotConfigured',
  INVALID_SIGNATURE: 'invalidSignature',
  UNKNOWN_ERROR: 'unknownError',
  DUBBING_GENERATION_COMPLETED: 'dubbingGenerationCompleted',
  SUBTITLE_FETCH_FAILED: 'subtitleFetchFailed',
  SUBTITLE_NOT_FOUND: 'subtitleNotFound',
} as const;

export type MessageCode = (typeof MessageCodes)[keyof typeof MessageCodes];

