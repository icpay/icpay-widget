import type { WalletSelectConfig } from '../index.js';
import type { AdapterInterface, WalletAccount, GetActorOptions } from '../index.js';
import stripeWalletIconUrl from '../img/stripe.js';

/** Data-URI logo for the Credit card wallet row (WalletSelect / wallet modal). */
export { stripeWalletIconUrl };

/**
 * Synthetic adapter for Stripe (credit card) payments.
 * No real wallet connection; used so the widget can show "Credit card" and call createPayment with networkType: 'stripe'.
 */
export class StripeAdapter implements AdapterInterface {
  id = 'stripe';
  label = 'Credit card';
  private _config: WalletSelectConfig;
  private _connected = false;

  constructor(args: { config: WalletSelectConfig }) {
    this._config = args.config || {};
  }

  async isInstalled(): Promise<boolean> {
    return true;
  }

  async isConnected(): Promise<boolean> {
    return this._connected;
  }

  async connect(): Promise<WalletAccount> {
    this._connected = true;
    return {
      owner: 'stripe',
      principal: null,
      connected: true,
    };
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  async getPrincipal(): Promise<string | null> {
    return this._connected ? 'stripe' : null;
  }

  getActor<T>(_options: GetActorOptions): any {
    return null;
  }
}
