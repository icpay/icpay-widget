import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { CoffeeShopConfig, CryptoOption } from '../types';
import { createSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Plug N Play will be imported dynamically when needed
let PlugNPlay: any = null;

// Debug logger utility for widget components
function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(`[ICPay Widget] ${message}`, data);
    } else {
      console.log(`[ICPay Widget] ${message}`);
    }
  }
}

@customElement('icpay-coffee-shop')
export class ICPayCoffeeShop extends LitElement {
  static styles = [baseStyles, css`
    .menu { display: grid; gap: 8px; margin-bottom: 12px; }
    .item { background: var(--icpay-surface-alt); border: 2px solid var(--icpay-border); border-radius: 12px; padding: 16px; display:flex; justify-content: space-between; align-items:center; cursor: pointer; color: var(--icpay-text); font-weight: 600; }
    .item.selected { background: var(--icpay-primary); color: #111827; border-color: var(--icpay-primary); }
    .total { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); border-radius: 12px; padding: 12px; text-align: center; margin-bottom: 12px; color: var(--icpay-text); }
    .crypto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 16px; }
    .crypto-option { background: var(--icpay-surface-alt); border: 2px solid var(--icpay-border); border-radius: 12px; padding: 12px 8px; text-align: center; cursor: pointer; color: var(--icpay-text); font-weight: 600; font-size: 12px; }
    .crypto-option.selected { background: var(--icpay-primary); color: #111827; border-color: var(--icpay-primary); }

    .error-message {
      border: 1px solid;
      font-weight: 500;
    }

    .error-message.info {
      background: rgba(59, 130, 246, 0.1);
      border-color: rgba(59, 130, 246, 0.3);
      color: #3b82f6;
    }

    .error-message.warning {
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
      color: #f59e0b;
    }

    .error-message.error {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }
  `];

  @property({ type: Object }) config!: CoffeeShopConfig;
  @state() private selectedIndex = 0;
  @state() private selectedSymbol = 'ICP';
  @state() private processing = false;
  @state() private availableLedgers: CryptoOption[] = [];
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'order' | null = null;
  @state() private showWalletModal = false;
  private pnp: any | null = null;

  private get cryptoOptions(): CryptoOption[] {
    // If config provides cryptoOptions, use those (allows override)
    if (this.config.cryptoOptions) {
      return this.config.cryptoOptions;
    }
    // Otherwise use fetched verified ledgers
    return this.availableLedgers;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Coffee shop connected', { config: this.config });

    if (this.config && typeof this.config.defaultItemIndex === 'number') this.selectedIndex = this.config.defaultItemIndex;
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      setTimeout(() => { if (action === 'order') this.order(); }, 0);
    }
  }

  private async loadVerifiedLedgers() {
    if (!isBrowser || !this.config?.publishableKey) {
      // Skip in SSR or if config not set yet
      return;
    }

    try {
      const sdk = createSdk(this.config);
      const ledgers = await sdk.client.getVerifiedLedgers();
      this.availableLedgers = ledgers.map(ledger => ({
        symbol: ledger.symbol,
        label: ledger.name,
        canisterId: ledger.canisterId
      }));
      // Set default selection to first available ledger
      if (this.availableLedgers.length > 0 && !this.selectedSymbol) {
        this.selectedSymbol = this.availableLedgers[0].symbol;
      }
    } catch (error) {
      console.warn('Failed to load verified ledgers:', error);
      // Fallback to basic options if API fails
      this.availableLedgers = [
        { symbol: 'ICP', label: 'ICP', canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' }
      ];
      if (!this.selectedSymbol) {
        this.selectedSymbol = 'ICP';
      }
    }
  }

  private selectItem(i: number) { this.selectedIndex = i; }
  private selectSymbol(s: string) { this.selectedSymbol = s; }

  private get selectedItem() { return this.config?.items?.[this.selectedIndex] || { name: 'Loading...', priceUsd: 0 }; }

  private async order() {
    if (!isBrowser) return; // Skip in SSR

    if (this.processing) return;

    debugLog(this.config?.debug || false, 'Coffee order started', {
      selectedItem: this.selectedItem,
      selectedSymbol: this.selectedSymbol,
      useOwnWallet: this.config.useOwnWallet
    });

    // Clear previous errors
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    this.processing = true;
    try {
      // Check wallet connection status first
      if (this.config.useOwnWallet) {
        if (!this.config.actorProvider) {
          this.pendingAction = 'order';
          this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
          return;
        }
      } else {
        // Built-in wallet handling - connect directly with Plug N Play
        if (!this.walletConnected) {
          debugLog(this.config?.debug || false, 'Connecting to wallet via Plug N Play');
          try {
            if (!PlugNPlay) { const module = await import('@windoge98/plug-n-play'); PlugNPlay = module.PNP; }
            this.pnp = new PlugNPlay(this.config?.plugNPlay || {});
            const availableWallets = this.pnp.getEnabledWallets();
            debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
            if (!availableWallets?.length) throw new Error('No wallets available');
            this.pendingAction = 'order';
            this.showWalletModal = true;
            return;
          } catch (error) {
            debugLog(this.config?.debug || false, 'Wallet connection error:', error);
            this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
            this.errorSeverity = ErrorSeverity.ERROR;
            return;
          }
        }
      }

      // Wallet is connected, proceed with payment
      debugLog(this.config?.debug || false, 'Creating SDK for payment');
      const sdk = createSdk(this.config);

      const opt = this.cryptoOptions.find(o => o.symbol === this.selectedSymbol)!;
      const canisterId = opt.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(this.selectedSymbol);

      debugLog(this.config?.debug || false, 'Coffee order payment details', {
        item: this.selectedItem.name,
        priceUsd: this.selectedItem.priceUsd,
        selectedSymbol: this.selectedSymbol,
        canisterId
      });

      const resp = await sdk.sendUsd(this.selectedItem.priceUsd, canisterId, { context: 'coffee', item: this.selectedItem.name });
      debugLog(this.config?.debug || false, 'Coffee order payment completed', { resp });

      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status, item: this.selectedItem.name });
      this.dispatchEvent(new CustomEvent('icpay-coffee', { detail: { item: this.selectedItem, tx: resp }, bubbles: true }));
    } catch (e) {
      // Handle errors using the new error handling system
      handleWidgetError(e, {
        onError: (error) => {
          this.dispatchEvent(new CustomEvent('icpay-error', { detail: error, bubbles: true }));

          // Update UI error state if error should be shown to user
          if (shouldShowErrorToUser(error)) {
            this.errorMessage = getErrorMessage(error);
            this.errorSeverity = getErrorSeverity(error);
            this.errorAction = getErrorAction(error);
          }
        }
      });
    } finally {
      this.processing = false;
    }
  }

  private getWalletId(w: any): string { return (w && (w.id || w.provider || w.key)) || ''; }
  private getWalletLabel(w: any): string { return (w && (w.label || w.name || w.title || w.id)) || 'Wallet'; }
  private getWalletIcon(w: any): string | null { return (w && (w.icon || w.logo || w.image)) || null; }

  private async connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      if (!walletId) throw new Error('No wallet ID provided');
      const result = await this.pnp.connect(walletId);
      const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
      if (!isConnected) throw new Error('Wallet connection was rejected');
      this.walletConnected = true;
      this.config = { ...this.config, connectedWallet: result, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
      this.showWalletModal = false;
      const action = this.pendingAction; this.pendingAction = null;
      if (action === 'order') setTimeout(() => this.order(), 0);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  render() {
    if (!this.config) {
      return html`<div class="card section">Loading...</div>`;
    }

    return html`
      <div class="card section">
        ${this.config?.progressBar?.enabled !== false ? html`<icpay-progress-bar mode="${this.config?.progressBar?.mode || 'modal'}"></icpay-progress-bar>` : null}
        <div class="menu">
          ${this.config.items.map((it, i) => html`
            <div class="item ${this.selectedIndex===i?'selected':''}" @click=${() => this.selectItem(i)}>
              <span>${it.name}</span>
              <span>$${Number(it?.priceUsd ?? 0).toFixed(2)}</span>
            </div>
          `)}
        </div>

        <div class="total">Order Total: $${Number(this.selectedItem?.priceUsd ?? 0).toFixed(2)}</div>

        <div>
          <icpay-token-selector
            .options=${this.cryptoOptions}
            .value=${this.selectedSymbol || ''}
            .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
            mode=${(this.config?.showLedgerDropdown || 'buttons')}
            @icpay-token-change=${(e: any) => this.selectSymbol(e.detail.symbol)}
          ></icpay-token-selector>
        </div>

        <button class="pay-button ${this.processing?'processing':''}" ?disabled=${this.processing} @click=${() => this.order()}>
          ${this.processing ? 'Processing…' : `Order ${this.selectedItem.name}`}
        </button>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`
              <button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">
                ${this.errorAction}
              </button>
            ` : ''}
          </div>
        ` : ''}
        ${(() => {
          const wallets = (this as any).pnp?.getEnabledWallets?.() || [];
          return (this.showWalletModal && this.pnp) ? html`
            <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:9999">
              <div class="card section" style="width:380px;border-radius:12px">
                <div class="label" style="font-weight:700;margin-bottom:12px;text-align:center">Choose Wallet</div>
                <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px">
                  ${wallets.map((w:any)=>{
                    const id = this.getWalletId(w);
                    const label = this.getWalletLabel(w);
                    const icon = this.getWalletIcon(w);
                    return html`
                      <button class="pay-button" style="display:flex;align-items:center;gap:10px;justify-content:center;padding:12px" @click=${() => this.connectWithWallet(id)}>
                        ${icon ? html`<img src="${icon}" alt="${label}" style="width:20px;height:20px;border-radius:4px;object-fit:contain;background:transparent" />` : ''}
                        <span>${label}</span>
                      </button>`;
                  })}
                </div>
                <button class="pay-button" style="background:#6b7280;color:#f9fafb" @click=${() => { this.showWalletModal = false; }}>
                  Cancel
                </button>
              </div>
            </div>
          ` : null;
        })()}
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-coffee-shop': ICPayCoffeeShop } }


