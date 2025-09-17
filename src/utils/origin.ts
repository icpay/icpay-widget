// Utility to resolve derivationOrigin with sane defaults and apex-domain fallback
// - If user provided derivationOrigin, return it
// - Else, prefer window.location.origin but collapse subdomains to apex domain when possible
//   e.g., demo.icpay.org -> https://icpay.org, app.example.co.uk -> https://example.co.uk
// - Fallback to origin as-is if parsing fails

export function resolveDerivationOrigin(userValue?: string): string | undefined {
  if (userValue && typeof userValue === 'string' && userValue.trim()) {
    return userValue.trim();
  }
  try {
    if (typeof window === 'undefined') return undefined;
    const url = new URL(window.location.origin);
    const host = url.hostname;
    // Heuristic apex extraction without external deps:
    // - Split by '.' and keep last 2 labels by default
    // - If TLD looks like 2-part ccTLD (e.g., co.uk, com.au), keep last 3
    const labels = host.split('.');
    if (labels.length < 2) return window.location.origin;
    const tld = labels.slice(-2).join('.');
    const last = labels[labels.length - 1];
    const secondLast = labels[labels.length - 2];
    const ccTLD2 = new Set(['uk', 'au', 'nz', 'za', 'br']);
    const secondLevelCC = new Set(['co', 'com', 'gov', 'ac', 'org', 'net', 'edu']);
    let apexHost = `${secondLast}.${last}`;
    if (ccTLD2.has(last) && secondLevelCC.has(secondLast) && labels.length >= 3) {
      // e.g., app.example.co.uk -> example.co.uk
      apexHost = `${labels[labels.length - 3]}.${secondLast}.${last}`;
    }
    return `${url.protocol}//${apexHost}`;
  } catch {
    try { return typeof window !== 'undefined' ? window.location.origin : undefined; } catch { return undefined; }
  }
}


