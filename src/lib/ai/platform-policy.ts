import type { ProviderType } from './providers/types';

/** Platform-funded package capacity. Subscriber-owned adapters remain supported. */
export const PLATFORM_PROVIDERS = ['groq', 'gemini'] as const;
export function isPlatformProvider(provider: string): provider is typeof PLATFORM_PROVIDERS[number] {
  return (PLATFORM_PROVIDERS as readonly string[]).includes(provider);
}
export function platformRows<T extends {provider_type: ProviderType; enabled: boolean}>(rows: T[]): T[] {
  return rows.filter(row => row.enabled && isPlatformProvider(row.provider_type));
}
