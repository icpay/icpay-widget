import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { PremiumContentConfig, CryptoOption } from '../types';
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

@customElement('icpay-premium-content')
export class ICPayPremiumContent extends LitElement {
  static styles = [baseStyles, css`
    .image-container {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 16px;
      background: #111827;
      border: 1px solid var(--icpay-border);
      aspect-ratio: 16/10;
    }
    .locked-image {
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(8px) grayscale(1);
      transition: all 0.6s ease;
      min-height: 200px;
    }
    .locked-image.unlocked { filter: blur(0px) grayscale(1); }
    .lock-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .pricing { text-align: center; margin: 16px 0; }
    .price { font-size: 28px; font-weight: 800; color: var(--icpay-text); }
    .label { color: var(--icpay-muted); font-size: 14px; }
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

  @property({ type: Object }) config!: PremiumContentConfig;
  @state() private selectedSymbol: string = 'ICP';
  @state() private unlocked = false;
  @state() private succeeded = false;
  @state() private processing = false;
  @state() private availableLedgers: CryptoOption[] = [];
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'pay' | null = null;
  @state() private showWalletModal = false;
  private pnp: any | null = null;
  private async tryAutoConnectPNP() {
    try {
      if (!this.config || this.config?.useOwnWallet) return;
      const raw = localStorage.getItem('icpay:pnp');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.provider || !saved?.principal) return;
      if (!PlugNPlay) {
        const module = await import('@windoge98/plug-n-play');
        PlugNPlay = module.PNP;
      }
      const pnp = new PlugNPlay(this.config?.plugNPlay || {});
      // Hydrate saved principal for UI/history; require connect on pay
      this.walletConnected = false;
      this.config = {
        ...this.config,
        connectedWallet: { owner: saved.principal, principal: saved.principal, connected: false } as any
      };
    } catch {}
  }

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

    debugLog(this.config?.debug || false, 'Premium content connected', { config: this.config });
    this.tryAutoConnectPNP();
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      setTimeout(() => { if (action === 'pay') this.onPay(); }, 0);
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
      // Set default selection to defaultSymbol or first available ledger
      if (!this.selectedSymbol) {
        this.selectedSymbol = this.config?.defaultSymbol || (this.availableLedgers[0]?.symbol || 'ICP');
      }
    } catch (error) {
      console.warn('Failed to load verified ledgers:', error);
      // Fallback to basic options if API fails
      this.availableLedgers = [
        { symbol: 'ICP', label: 'ICP', canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' }
      ];
      if (!this.selectedSymbol) this.selectedSymbol = 'ICP';
    }
  }

  private async onPay() {
    if (!isBrowser) return; // Skip in SSR

    if (this.processing || this.unlocked) return;

    debugLog(this.config?.debug || false, 'Premium content payment started', {
      priceUsd: this.config.priceUsd,
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
          this.pendingAction = 'pay';
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
            this.pendingAction = 'pay';
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

      // resolve canisterId by symbol if provided, otherwise require canisterId per option
      const option = this.cryptoOptions.find(o => o.symbol === this.selectedSymbol)!;
      const canisterId = option.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(this.selectedSymbol);

      debugLog(this.config?.debug || false, 'Payment details', {
        priceUsd: this.config.priceUsd,
        selectedSymbol: this.selectedSymbol,
        canisterId
      });

      const resp = await sdk.sendUsd(this.config.priceUsd, canisterId, { context: 'premium-content' });
      debugLog(this.config?.debug || false, 'Payment completed', { resp });

      this.unlocked = true;
      this.succeeded = true;
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status });
      this.dispatchEvent(new CustomEvent('icpay-unlock', { detail: { amount: this.config.priceUsd, tx: resp }, bubbles: true }));
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

  private select(symbol: string) {
    this.selectedSymbol = symbol;
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
      if (action === 'pay') setTimeout(() => this.onPay(), 0);
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
        <div class="image-container">
          <div class="locked-image ${this.unlocked ? 'unlocked' : ''}" style="background-image:url('${this.config.imageUrl || ''}')"></div>
          ${this.unlocked ? null : html`<div class="lock-overlay">🔒</div>`}
        </div>

        <div class="pricing">
          <div class="price">$${Number(this.config?.priceUsd ?? 0).toFixed(2)}</div>
          <div class="label">One-time unlock</div>
        </div>

        <div>
          <icpay-token-selector
            .options=${this.cryptoOptions}
            .value=${this.selectedSymbol || ''}
            .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
            mode=${(this.config?.showLedgerDropdown || 'buttons')}
            @icpay-token-change=${(e: any) => this.select(e.detail.symbol)}
          ></icpay-token-selector>
        </div>

        <button class="pay-button ${this.processing ? 'processing' : ''}" ?disabled=${this.processing || this.unlocked || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)} @click=${() => this.onPay()}>
          ${this.unlocked ? 'Unlocked' : (this.processing ? 'Processing…' : (
            (this.config?.buttonLabel || 'Pay ${amount} with {symbol}')
              .replace('{amount}', `${Number(this.config?.priceUsd ?? 0).toFixed(2)}`)
              .replace('{symbol}', this.selectedSymbol)
          ))}
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

declare global { interface HTMLElementTagNameMap { 'icpay-premium-content': ICPayPremiumContent } }


