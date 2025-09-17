// Utility to resolve derivationOrigin with sane defaults
// - If user provided derivationOrigin, return it
// - Else, return window.location.origin as-is (must match a canister-mapped origin for II)
export function resolveDerivationOrigin(userValue?: string): string | undefined {
  if (userValue && typeof userValue === 'string' && userValue.trim()) {
    return userValue.trim();
  }
  try { return typeof window !== 'undefined' ? window.location.origin : undefined; } catch { return undefined; }
}


