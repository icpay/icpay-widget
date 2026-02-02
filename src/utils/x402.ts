// Minimal detection utility for X402-capable clients
// This centralizes all future X402-related checks

/**
 * Returns true when the connected wallet is Base/Coinbase on iOS.
 * On iOS, Base Wallet uses Passkeys (WebAuthn) and returns an assertion blob, not raw ECDSA r,s,v,
 * so x402 (EIP-3009) cannot be used on-chain. Use normal payment flow instead.
 */
export function shouldSkipX402ForBaseOnIos(walletId: string | null | undefined): boolean {
  if (!walletId || String(walletId).toLowerCase() !== 'coinbase') return false;
  try {
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').toLowerCase() : '';
    return ua.includes('iphone') || ua.includes('ipad');
  } catch {
    return false;
  }
}

function debugLogLocal(debug: boolean, message: string, data?: any): void {
  if (!debug) return;
  try {
    if (data !== undefined) {
      console.log(`[ICPay Widget][x402] ${message}`, data);
    } else {
      console.log(`[ICPay Widget][x402] ${message}`);
    }
  } catch {}
}

/**
 * Checks whether the currently available wallet supports EIP-712 signing (required for new x402 flow).
 * Call this after a token is selected and right before executing createPayment.
 * Note: This uses eth_requestAccounts which may prompt the wallet to connect.
 */
export async function clientSupportsX402(debug = false, opts?: { chainId?: number; verifyingContract?: string }): Promise<boolean> {
  try {
    debugLogLocal(debug, 'Starting EIP-712 capability check for x402');
    const hasWindow = typeof window !== 'undefined';
    const hasEthereum = hasWindow && typeof (window as any)?.ethereum !== 'undefined';
    if (!hasEthereum) {
      debugLogLocal(debug, 'No wallet detected (window.ethereum missing)');
      return false;
    }

    // Request accounts (may prompt) and attempt EIP-712 signTypedData_v4
    const eth: any = (window as any).ethereum;
    const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
    const from = Array.isArray(accounts) && accounts[0] ? accounts[0] : null;
    if (!from) {
      debugLogLocal(debug, 'Wallet present but no accounts returned');
      return false;
    }

    const chainId = (opts && typeof opts.chainId === 'number' ? opts.chainId : 1);
    const verifyingContract = (opts && opts.verifyingContract) || '0x0000000000000000000000000000000000000000';
    const typedData = {
      domain: { name: 'x402', version: '1', chainId, verifyingContract },
      message: { purpose: 'Test EIP-712 signing' },
      primaryType: 'Message',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Message: [{ name: 'purpose', type: 'string' }],
      },
    };
    const payload = JSON.stringify(typedData);
    const signature = await eth.request({
      method: 'eth_signTypedData_v4',
      params: [from, payload],
    });
    debugLogLocal(debug, 'EIP-712 signing supported', { from, signature: typeof signature === 'string' ? `${signature.slice(0, 10)}…` : typeof signature });
    return true;
  } catch (e) {
    debugLogLocal(debug, 'EIP-712 check error', e);
  }
  debugLogLocal(debug, 'EIP-712 not supported or user denied');
  return false;
}

