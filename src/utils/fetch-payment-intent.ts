/**
 * Fetch a payment intent by id from icpay-api (GET /sdk/public/payments/intents/:id).
 * Uses publishable key for auth. Returns the same shape as create-intent response.
 */

const isBrowser = typeof window !== 'undefined';

const TRANSIENT_HTTP = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type PaymentIntentResponse = {
  paymentIntentId: string;
  paymentIntentCode: number | null;
  payment: null;
  paymentIntent: {
    id: string;
    accountId: string;
    amount: string;
    amountUsd?: number | null;
    amountInFiat?: number | null;
    ledgerCanisterId: string;
    description?: string | null;
    expectedSenderPrincipal?: string | null;
    status: string;
    metadata?: Record<string, unknown>;
    intentCode: number;
    chainId?: string | null;
    chainName?: string | null;
    chainType?: string | null;
    accountCanisterId?: string | number | null;
    contractAddress?: string | null;
    rpcUrlPublic?: string | null;
    rpcChainId?: string | number | null;
    functionSelectors?: Record<string, string> | null;
    externalCostAmount?: string | null;
    transactionBase64?: string | null;
    fiatCurrencyCode?: string | null;
    fiatCurrencySymbol?: string | null;
    tokenShortcode?: string | null;
    shortcode?: string | null;
    [key: string]: unknown;
  };
  onramp: null;
};

export async function fetchPaymentIntent(
  apiUrl: string,
  publishableKey: string,
  intentId: string,
  debug = false
): Promise<PaymentIntentResponse | null> {
  if (!isBrowser || !intentId || !publishableKey) return null;
  const base = (apiUrl || 'https://api.icpay.org').replace(/\/$/, '');
  // Use publishable key in query string so the browser sends a "simple" cross-origin GET
  // (no Authorization / non-simple Content-Type) — avoids CORS preflight (OPTIONS), which some
  // proxies mis-handle with 502. Publishable keys are public by design.
  const qs = new URLSearchParams({ publishableKey });
  const url = `${base}/sdk/public/payments/intents/${encodeURIComponent(intentId)}?${qs.toString()}`;
  try {
    if (debug) {
      console.log('[ICPay Widget] Fetching payment intent', { intentId, url: url.replace(publishableKey, '***') });
    }
    const maxAttempts = 4; // 1 try + 3 retries for nginx/upstream blips (common around webhook completion)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as PaymentIntentResponse;
        if (!data?.paymentIntent?.id) return null;
        return data;
      }
      const errBody = await res.text();
      const retryable = TRANSIENT_HTTP.has(res.status) && attempt < maxAttempts - 1;
      if (debug) {
        console.log(
          '[ICPay Widget] Fetch payment intent failed',
          res.status,
          retryable ? '(will retry)' : '',
          errBody.slice(0, 200)
        );
      }
      if (retryable) {
        await sleep(200 * (1 << attempt));
        continue;
      }
      return null;
    }
    return null;
  } catch (e) {
    if (debug) console.log('[ICPay Widget] Fetch payment intent error', e);
    return null;
  }
}

/** Terminal statuses: intent already completed/failed/canceled so no payment needed */
export function isPaymentIntentTerminal(status: string | undefined): boolean {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return (
    s === 'succeeded' ||
    s === 'completed' ||
    s === 'failed' ||
    s === 'canceled' ||
    s === 'cancelled' ||
    s === 'mismatched'
  );
}

export function isPaymentIntentCompleted(status: string | undefined): boolean {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'succeeded' || s === 'completed';
}
