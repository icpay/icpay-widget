import { Icpay, PriceCalculationResult, IcpayConfig } from '@ic-pay/icpay-sdk';
import type { CommonConfig } from '../types';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Debug logger utility for widget
function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(`[ICPay Widget] ${message}`, data);
    } else {
      console.log(`[ICPay Widget] ${message}`);
    }
  }
}

export type WidgetSdk = {
  client: InstanceType<typeof Icpay>;
  quoteUsd(usdAmount: number, ledgerCanisterId: string): Promise<PriceCalculationResult>;
  sendUsd(usdAmount: number, ledgerCanisterId: string, metadata?: Record<string, any>): Promise<any>;
  startOnrampUsd(usdAmount: number, ledgerCanisterId: string, metadata?: Record<string, any>): Promise<any>;
  notifyIntentUntilComplete(paymentIntentId: string, intervalMs?: number, orderId?: string): { stop: () => void };
};

export function createSdk(config: CommonConfig): WidgetSdk {
  if (!isBrowser) {
    // Return a mock SDK for SSR
    return {
      client: {} as any,
      quoteUsd: async () => ({ tokenAmountDecimals: '0' } as any),
      sendUsd: async () => ({ transactionId: '0', status: 'pending' } as any),
      startOnrampUsd: async () => ({ transactionId: '0', status: 'pending', metadata: { icpay_onramp: { sessionId: null } } } as any),
      notifyIntentUntilComplete: () => ({ stop: () => {} })
    };
  }

  debugLog(config.debug || false, 'Creating SDK with config:', config);

  // Filter out undefined values to avoid constructor errors
  const sdkConfig: IcpayConfig = {
    publishableKey: config.publishableKey,
  };
  // Default to enabling SDK events for the widget unless explicitly set in config
  if ((config as any).enableEvents !== undefined) {
    (sdkConfig as any).enableEvents = (config as any).enableEvents;
  } else {
    (sdkConfig as any).enableEvents = true;
  }

  if (config.apiUrl) sdkConfig.apiUrl = config.apiUrl;
  if (config.icHost) sdkConfig.icHost = config.icHost;
  if (config.actorProvider) sdkConfig.actorProvider = config.actorProvider;
  if (config.connectedWallet) sdkConfig.connectedWallet = config.connectedWallet;
  // Pass selected EVM provider from widget to SDK so signatures use the chosen wallet
  if ((config as any).evmProvider) (sdkConfig as any).evmProvider = (config as any).evmProvider;
  // Pass selected Solana provider from widget to SDK so signatures use the chosen wallet
  if ((config as any).solanaProvider) (sdkConfig as any).solanaProvider = (config as any).solanaProvider;
  // Propagate kill switch to SDK (defaults to true inside SDK)
  if (config.onrampDisabled !== undefined) (sdkConfig as any).onrampDisabled = config.onrampDisabled;

  // Pass debug configuration to SDK if specified
  if (config.debug !== undefined) {
    sdkConfig.debug = config.debug;
  }

  debugLog(config.debug || false, 'Filtered SDK config:', sdkConfig);
  try {
    debugLog(config.debug || false, 'typeof Icpay:', typeof Icpay);
    const client = new Icpay(sdkConfig);

    // Re-emit SDK instance events on window so UI components can listen globally
    if (isBrowser) {
      const clientAny = client as any;
      const forward = (type: string) => {
        clientAny.addEventListener(type, (e: any) => {
          window.dispatchEvent(new CustomEvent(type, { detail: e?.detail ?? e }));
        });
      };
      [
        'icpay-sdk-error',
        'icpay-sdk-transaction-created',
        'icpay-sdk-transaction-updated',
        'icpay-sdk-transaction-completed',
        'icpay-sdk-transaction-failed',
        'icpay-sdk-method-start',
        'icpay-sdk-method-success',
        'icpay-sdk-method-error'
      ].forEach(forward);
    }

    async function quoteUsd(usdAmount: number, tokenShortcode?: string, ledgerCanisterId?: string) {
      // Preferred path: tokenShortcode; fallback: ledgerCanisterId
      if (typeof tokenShortcode === 'string' && tokenShortcode.trim().length > 0) {
        return (client as any).calculateTokenAmountFromUSD({ usdAmount, tokenShortcode: tokenShortcode.toLowerCase() });
      }
      if (typeof ledgerCanisterId === 'string' && ledgerCanisterId.trim().length > 0) {
        return client.calculateTokenAmountFromUSD({ usdAmount, ledgerCanisterId });
      }
      throw new Error('quoteUsd requires tokenShortcode or ledgerCanisterId');
    }

    async function sendUsd(usdAmount: number, tokenShortcode?: string, metadata?: Record<string, any>, ledgerCanisterId?: string) {
      // Merge global config.metadata with call-specific metadata
      const mergedMeta = { ...(config as any).metadata, ...(metadata || {}) } as Record<string, any>;
      // Description passed through to intent (components decide X402 vs wallet flow before calling us)
      const fallbackDesc = `Pay ${usdAmount} with crypto`;
      const description =
        (config as any).description ||
        (mergedMeta as any).__description ||
        (mergedMeta as any).description ||
        fallbackDesc;
      const payload: any = {
        usdAmount,
        metadata: mergedMeta,
        description,
        recipientAddress: (config as any)?.recipientAddress || '0x0000000000000000000000000000000000000000',
      };
      if (typeof tokenShortcode === 'string' && tokenShortcode.trim().length > 0) {
        payload.tokenShortcode = tokenShortcode.toLowerCase();
      }
      if (typeof ledgerCanisterId === 'string' && ledgerCanisterId.trim().length > 0) {
        payload.ledgerCanisterId = ledgerCanisterId;
      }
      if (!payload.tokenShortcode && !payload.ledgerCanisterId) {
        throw new Error('sendUsd requires tokenShortcode or ledgerCanisterId');
      }
      debugLog(Boolean(config.debug), 'Calling createPaymentUsd (flow decision handled by components)', payload);
      return (client as any).createPaymentUsd(payload);
    }

    async function startOnrampUsd(usdAmount: number, ledgerCanisterId: string, metadata?: Record<string, any>) {
      // Trigger onramp flow through SDK; SDK returns onramp data in metadata.onramp
      const mergedMeta = { ...(config as any).metadata, ...(metadata || {}) } as Record<string, any>;
      const fallbackDesc = `Pay ${usdAmount} with crypto`;
      const description =
        (config as any).description ||
        (mergedMeta as any).__description ||
        (mergedMeta as any).description ||
        fallbackDesc;
      debugLog(Boolean(config.debug), 'Calling onramp createPaymentUsd', {
        usdAmount,
        ledgerCanisterId,
        description,
      });
      return (client as any).createPaymentUsd({
        usdAmount,
        ledgerCanisterId,
        metadata: mergedMeta,
        onrampPayment: true,
        description,
        recipientAddress: (config as any)?.recipientAddress || '0x0000000000000000000000000000000000000000',
      });
    }


    function notifyIntentUntilComplete(paymentIntentId: string, intervalMs?: number, orderId?: string) {
      return (client as any).notifyPaymentIntentOnRamp({ paymentIntentId, intervalMs, orderId });
    }

    return { client, quoteUsd, sendUsd, startOnrampUsd, notifyIntentUntilComplete };
  } catch (error) {
    debugLog(config.debug || false, 'Error creating SDK:', error);
    throw error;
  }
}


