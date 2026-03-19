export interface TurnkeyRuntimeConfig {
  organizationId: string;
  authProxyConfigId: string;
}

export function getTurnkeyRuntimeConfig(): TurnkeyRuntimeConfig | null {
  // Support both BitExpress-prefixed vars and Turnkey docs defaults.
  const organizationId = (
    process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ??
    process.env.NEXT_PUBLIC_ORGANIZATION_ID
  )?.trim();
  const authProxyConfigId = (
    process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ??
    process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID
  )?.trim();

  if (!organizationId || !authProxyConfigId) {
    return null;
  }

  return {
    organizationId,
    authProxyConfigId,
  };
}

export function isTurnkeyEnabled(): boolean {
  return getTurnkeyRuntimeConfig() !== null;
}