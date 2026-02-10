/**
 * Fetch a payment intent by id from icpay-api (GET /sdk/public/payments/intents/:id).
 * Uses publishable key for auth. Returns the same shape as create-intent response.
 */

const isBrowser = typeof window !== 'undefined';

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
  const url = `${base}/sdk/public/payments/intents/${encodeURIComponent(intentId)}`;
  try {
    if (debug) {
      console.log('[ICPay Widget] Fetching payment intent', { intentId, url: url.replace(publishableKey, '***') });
    }
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publishableKey}`,
      },
    });
    if (!res.ok) {
      if (debug) console.log('[ICPay Widget] Fetch payment intent failed', res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as PaymentIntentResponse;
    if (!data?.paymentIntent?.id) return null;
    return data;
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
