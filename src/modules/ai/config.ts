/** Stub: AI config types */

export type ProviderId = string;
export type ProviderInfo = {
  id: ProviderId;
  name: string;
  baseUrl?: string;
};

export type ModelEndpoint = {
  id: string;
  providerId: ProviderId;
  model: string;
};

export const PROVIDERS: ProviderInfo[] = [];
export const MODEL_ENDPOINTS: ModelEndpoint[] = [];

export function endpointIdFromCompatModel(_model: string): string | null {
  return null;
}

export function getProviderInfo(_id: ProviderId): ProviderInfo | undefined {
  return undefined;
}
