/**
 * Resolve the final price for a service, considering client-specific overrides
 * @param serviceDefaultPrice - The default price from the service configuration
 * @param clientOverridePrice - Optional client-specific price override
 * @returns The resolved price (override if exists, otherwise default)
 */
export function resolveServicePrice({
  serviceDefaultPrice,
  clientOverridePrice,
}: {
  serviceDefaultPrice: number;
  clientOverridePrice?: number | null;
}): number {
  return clientOverridePrice ?? serviceDefaultPrice;
}
