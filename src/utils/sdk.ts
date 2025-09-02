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
};

export function createSdk(config: CommonConfig): WidgetSdk {
  if (!isBrowser) {
    // Return a mock SDK for SSR
    return {
      client: {} as any,
      quoteUsd: async () => ({ tokenAmountDecimals: '0' } as any),
      sendUsd: async () => ({ transactionId: '0', status: 'pending' } as any)
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

    async function quoteUsd(usdAmount: number, ledgerCanisterId: string) {
      return client.calculateTokenAmountFromUSD({ usdAmount, ledgerCanisterId });
    }

    async function sendUsd(usdAmount: number, ledgerCanisterId: string, metadata?: Record<string, any>) {
      // Use direct USD-based API for simplicity in widgets
      return (client as any).sendFundsUsd({ usdAmount, ledgerCanisterId, metadata });
    }

    return { client, quoteUsd, sendUsd };
  } catch (error) {
    debugLog(config.debug || false, 'Error creating SDK:', error);
    throw error;
  }
}


