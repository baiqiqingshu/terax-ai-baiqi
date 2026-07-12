/** Stub: AI keyring */

export type ProviderKeys = Record<string, string>;
export const EMPTY_PROVIDER_KEYS: ProviderKeys = {};

export function getKey(_providerId: string): string | null {
  return null;
}

export function getCustomEndpointKey(_endpointId: string): string | null {
  return null;
}

export function setKey(_providerId: string, _key: string): void {}
export function deleteKey(_providerId: string): void {}
