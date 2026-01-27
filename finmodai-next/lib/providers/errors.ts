export class ProviderError extends Error {
  code: string;
  provider: string;
  status?: number;

  constructor(provider: string, code: string, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

export const notConfigured = (provider: string) =>
  new ProviderError(provider, 'NOT_CONFIGURED', `${provider} not configured`);

export const providerFailure = (provider: string, message: string, status?: number) =>
  new ProviderError(provider, 'PROVIDER_ERROR', message, status);

export const providerTimeout = (provider: string, message = 'Request timed out') =>
  new ProviderError(provider, 'TIMEOUT', message, 408);
