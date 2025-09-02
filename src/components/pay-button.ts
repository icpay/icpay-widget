import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { PayButtonConfig, CryptoOption } from '../types';
import { createSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';

const isBrowser = typeof window !== 'undefined';
let PlugNPlay: any = null;

function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(`[ICPay Widget] ${message}`, data);
    } else {
      console.log(`[ICPay Widget] ${message}`);
    }
  }
}

@customElement('icpay-pay-button')
export class ICPayPayButton extends LitElement {
  static styles = [baseStyles, css`
    .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
    .row.single { grid-template-columns: 1fr; }
    select { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); color: var(--icpay-text); border-radius: 8px; padding: 10px; font-weight: 600; }
    .error-message { border: 1px solid; font-weight: 500; }
    .error-message.info { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
    .error-message.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #f59e0b; }
    .error-message.error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
  `];

  @property({ type: Object }) config!: PayButtonConfig;
  @state() private selectedSymbol: string | null = null;
  @state() private processing = false;
  @state() private succeeded = false;
  @state() private availableLedgers: CryptoOption[] = [];
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'pay' | null = null;
  @state() private showWalletModal = false;
  private pnp: any | null = null;

  private get cryptoOptions(): CryptoOption[] {
    if (this.config?.cryptoOptions?.length) return this.config.cryptoOptions;
    return this.availableLedgers;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return;
    debugLog(this.config?.debug || false, 'Pay button connected', { config: this.config });
    // Load ledgers by default when cryptoOptions not provided (widget should be self-sufficient)
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
    // Initialize default symbol
    if (this.config?.defaultSymbol) this.selectedSymbol = this.config.defaultSymbol;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      setTimeout(() => { if (action === 'pay') this.pay(); }, 0);
    }
  }

  private async loadVerifiedLedgers() {
    if (!isBrowser || !this.config?.publishableKey) return;
    try {
      const sdk = createSdk(this.config);
      const ledgers = await sdk.client.getVerifiedLedgers();
      this.availableLedgers = ledgers.map((ledger: any) => ({ symbol: ledger.symbol, label: ledger.name, canisterId: ledger.canisterId }));
      if (!this.selectedSymbol) {
        this.selectedSymbol = this.config?.defaultSymbol || (this.availableLedgers[0]?.symbol ?? 'ICP');
      }
    } catch (error) {
      this.dispatchEvent(new CustomEvent('icpay-error', { detail: { message: 'Failed to load verified ledgers', cause: error }, bubbles: true }));
      this.availableLedgers = [ { symbol: 'ICP', label: 'ICP', canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' } ];
      if (!this.selectedSymbol) this.selectedSymbol = this.config?.defaultSymbol || 'ICP';
    }
  }

  private selectSymbol(symbol: string) { this.selectedSymbol = symbol; }

  private async ensureWallet(): Promise<boolean> {
    if (this.config.useOwnWallet) {
      if (!this.config.actorProvider) {
        this.pendingAction = 'pay';
        this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
        return false;
      }
      return true;
    }

    if (this.walletConnected) return true;
    try {
      if (!PlugNPlay) {
        const module = await import('@windoge98/plug-n-play');
        PlugNPlay = module.PNP;
      }
      this.pnp = new PlugNPlay(this.config?.plugNPlay || {});
      const availableWallets = this.pnp.getEnabledWallets();
      debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
      if (!availableWallets?.length) throw new Error('No wallets available');
      // Show chooser modal and resume later
      this.pendingAction = 'pay';
      this.showWalletModal = true;
      return false;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      return false;
    }
  }

  private getWalletId(w: any): string { return (w && (w.id || w.provider || w.key)) || ''; }
  private getWalletLabel(w: any): string { return (w && (w.label || w.name || w.title || w.id)) || 'Wallet'; }
  private getWalletIcon(w: any): string | null { return (w && (w.icon || w.logo || w.image)) || null; }

  private async connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      debugLog(this.config?.debug || false, 'Connecting to wallet', { walletId });
      if (!walletId) throw new Error('No wallet ID provided');
      const result = await this.pnp.connect(walletId);
      debugLog(this.config?.debug || false, 'Wallet connect result', result);
      const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
      if (!isConnected) throw new Error('Wallet connection was rejected');
      this.walletConnected = true;
      this.config = { ...this.config, connectedWallet: result, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
      this.showWalletModal = false;
      const action = this.pendingAction; this.pendingAction = null;
      if (action === 'pay') setTimeout(() => this.pay(), 0);
    } catch (error) {
      debugLog(this.config?.debug || false, 'Wallet connection error', error);
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  private renderWalletModal() {
    if (!this.showWalletModal || !this.pnp) return null as any;
    const wallets = this.pnp.getEnabledWallets() || [];
    return html`
      <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:9999">
        <div class="card" style="width:380px;padding:16px;border-radius:12px">
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
    `;
  }

  private async pay() {
    if (!isBrowser || this.processing) return;

    // Reset error state
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    this.processing = true;
    try {
      const ready = await this.ensureWallet();
      if (!ready) return;

      const sdk = createSdk(this.config);
      const symbol = this.selectedSymbol || 'ICP';
      const opt = this.cryptoOptions.find(o => o.symbol === symbol);
      const canisterId = opt?.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(symbol);
      const amountUsd = Number(this.config?.amountUsd ?? 0);
      const meta = { context: 'pay-button' } as Record<string, any>;

      const resp = await sdk.sendUsd(amountUsd, canisterId, meta);
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status });
      this.succeeded = true;
      this.dispatchEvent(new CustomEvent('icpay-pay', { detail: { amount: amountUsd, tx: resp }, bubbles: true }));
    } catch (e) {
      handleWidgetError(e, {
        onError: (error) => {
          this.dispatchEvent(new CustomEvent('icpay-error', { detail: error, bubbles: true }));
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

  render() {
    if (!this.config) return html`<div class="card section">Loading...</div>`;

    const optionsCount = this.cryptoOptions?.length || 0;
    const hasMultiple = optionsCount > 1;
    const rawMode = (this.config?.showLedgerDropdown as any) as ('buttons'|'dropdown'|'none'|undefined);
    const globalMode: 'buttons'|'dropdown'|'none' = rawMode === 'dropdown' ? 'dropdown' : rawMode === 'buttons' ? 'none' : 'none';
    const showSelector = (globalMode !== 'none') && (hasMultiple || globalMode === 'dropdown');
    const tokenSelectorMode: 'buttons'|'dropdown'|'none' = globalMode === 'dropdown' ? 'dropdown' : (hasMultiple ? 'buttons' : 'none');
    const selectedSymbol = this.selectedSymbol || this.config?.defaultSymbol || 'ICP';
    const amountPart = typeof this.config?.amountUsd === 'number' ? `${Number(this.config.amountUsd).toFixed(2)}` : '';
    const rawLabel = this.config?.buttonLabel || (typeof this.config?.amountUsd === 'number' ? 'Pay ${amount} with {symbol}' : 'Pay with {symbol}');
    const label = rawLabel.replace('{amount}', amountPart || '$0.00').replace('{symbol}', selectedSymbol);
    const progressEnabled = this.config?.progressBar?.enabled !== false;
    const showProgressBar = progressEnabled;

    return html`
      <div class="card section">
        ${showProgressBar ? html`
          <icpay-progress-bar></icpay-progress-bar>
        ` : null}

        <div class="row ${showSelector ? '' : 'single'}">
          ${showSelector ? html`
            <icpay-token-selector
              .options=${this.cryptoOptions}
              .value=${this.selectedSymbol || ''}
              .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
              mode=${tokenSelectorMode}
              @icpay-token-change=${(e: any) => this.selectSymbol(e.detail.symbol)}
            ></icpay-token-selector>
          ` : null}
          <button class="pay-button ${this.processing?'processing':''}"
            ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
            @click=${() => this.pay()}>
            ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : label)}
          </button>
        </div>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`<button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">${this.errorAction}</button>` : ''}
          </div>
        ` : ''}
        ${this.renderWalletModal()}
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-pay-button': ICPayPayButton } }


