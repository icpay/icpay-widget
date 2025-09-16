import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { TipJarConfig, CryptoOption } from '../types';
import { createSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';
import { renderWalletSelectorModal } from './wallet-selector-modal';
import { renderTransakOnrampModal, TransakOnrampOptions } from './transak-onramp-modal';

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

@customElement('icpay-tip-jar')
export class ICPayTipJar extends LitElement {
  static styles = [baseStyles, css`
    .jar { width: 120px; height: 160px; margin: 0 auto 12px; position: relative; background: linear-gradient(135deg, #374151 0%, #4b5563 100%); border-radius: 0 0 60px 60px; border: 3px solid #6b7280; border-top: 8px solid #6b7280; overflow: hidden; }
    .fill { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%); transition: height 0.8s ease; height: 0%; }
    .amounts { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 12px 0; }
    .chip { background: var(--icpay-surface-alt); border: 2px solid var(--icpay-border); border-radius: 12px; padding: 12px; text-align: center; cursor: pointer; color: var(--icpay-text); font-weight: 600; }
    .chip.selected { background: var(--icpay-primary); color: #111827; border-color: var(--icpay-primary); }
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

  @property({ type: Object }) config!: TipJarConfig;
  @state() private selectedAmount = 1;
  @state() private selectedSymbol: string = 'ICP';
  @state() private total = 0;
  @state() private processing = false;
  @state() private succeeded = false;
  @state() private availableLedgers: CryptoOption[] = [];
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'tip' | null = null;
  @state() private showWalletModal = false;
  private pnp: any | null = null;
  @state() private showOnrampModal = false;
  @state() private onrampSessionId: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  private transakMessageHandlerBound: any | null = null;
  private onrampPollTimer: number | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;
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
      const _cfg1: any = { ...(this.config?.plugNPlay || {}) };
      try { if (typeof window !== 'undefined') _cfg1.derivationOrigin = window.location.origin; } catch {}
      const pnp = new PlugNPlay(_cfg1);
      // Do not call connect here; just hydrate saved principal for UI/history.
      // Keep walletConnected false so pressing pay triggers real connect.
      this.walletConnected = false;
      this.config = {
        ...this.config,
        connectedWallet: { owner: saved.principal, principal: saved.principal, connected: false } as any
      };
    } catch {}
  }

  private get amounts(): number[] {
    return this.config?.amountsUsd || [1, 5, 10];
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

    debugLog(this.config?.debug || false, 'Tip jar connected', { config: this.config });

    if (this.config && this.config.defaultAmountUsd) this.selectedAmount = this.config.defaultAmountUsd;
    this.tryAutoConnectPNP();
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
    if (this.config?.defaultSymbol) this.selectedSymbol = this.config.defaultSymbol;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      // Resume the original action after external wallet connected
      setTimeout(() => { if (action === 'tip') this.tip(); }, 0);
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
      // If user provided a single cryptoOption, auto-select regardless of dropdown mode
      if (this.config?.cryptoOptions && this.config.cryptoOptions.length === 1) {
        this.selectedSymbol = this.config.cryptoOptions[0].symbol;
      }
      // Set default selection to provided defaultSymbol, else first available
      if (!this.selectedSymbol && this.availableLedgers.length > 0) {
        this.selectedSymbol = this.config?.defaultSymbol || this.availableLedgers[0].symbol;
      }
    } catch (error) {
      console.warn('Failed to load verified ledgers:', error);
      // Fallback to basic options if API fails
      this.availableLedgers = [ { symbol: 'ICP', label: 'ICP', canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' } ];
      if (!this.selectedSymbol) {
        this.selectedSymbol = 'ICP';
      }
    }
  }

  private selectAmount(v: number) { this.selectedAmount = v; }
  private selectSymbol(s: string) { this.selectedSymbol = s; }

  private get fillPercentage() {
    const max = 50; // visual cap
    return Math.min((this.total / max) * 100, 100);
  }

  private async tip() {
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Tip button clicked!', { config: this.config, processing: this.processing });
    if (this.processing) return;

    // Clear previous errors
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'tip', type: 'sendUsd', amount: this.selectedAmount, currency: this.selectedSymbol } })); } catch {}

    this.processing = true;
    try {
      // Check wallet connection status first
      if (this.config.useOwnWallet) {
        // External wallet handling - always require explicit connect before pay
        if (!this.config.actorProvider) {
          this.pendingAction = 'tip';
          this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
          return;
        }
      } else {
        // Built-in wallet handling - connect directly with Plug N Play
        if (!this.walletConnected) {
          debugLog(this.config?.debug || false, 'Connecting to wallet via Plug N Play');
          try {
            if (!PlugNPlay) { const module = await import('@windoge98/plug-n-play'); PlugNPlay = module.PNP; }
            const _cfg2: any = { ...(this.config?.plugNPlay || {}) };
            try { if (typeof window !== 'undefined') _cfg2.derivationOrigin = window.location.origin; } catch {}
            this.pnp = new PlugNPlay(_cfg2);
            const availableWallets = this.pnp.getEnabledWallets();
            debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
            if (!availableWallets?.length) throw new Error('No wallets available');
            this.pendingAction = 'tip';
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

      debugLog(this.config?.debug || false, 'Tip payment details', {
        amount: this.selectedAmount,
        selectedSymbol: this.selectedSymbol,
        canisterId
      });

      const resp = await sdk.sendUsd(this.selectedAmount, canisterId, { context: 'tip-jar' });
      debugLog(this.config?.debug || false, 'Tip payment completed', { resp });

      this.total += this.selectedAmount;
      this.succeeded = true;
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status, total: this.total });
      this.dispatchEvent(new CustomEvent('icpay-tip', { detail: { amount: this.selectedAmount, tx: resp }, bubbles: true }));
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

  private attachTransakMessageListener() {
    if (this.transakMessageHandlerBound) return;
    this.transakMessageHandlerBound = (event: MessageEvent) => this.onTransakMessage(event);
    try { window.addEventListener('message', this.transakMessageHandlerBound as any); } catch {}
  }

  private detachTransakMessageListener() {
    if (this.transakMessageHandlerBound) {
      try { window.removeEventListener('message', this.transakMessageHandlerBound as any); } catch {}
      this.transakMessageHandlerBound = null;
    }
  }

  private onTransakMessage(event: MessageEvent) {
    const data: any = event?.data;
    const eventId: string | undefined = data?.event_id || data?.eventId || data?.id;
    if (!eventId || typeof eventId !== 'string') return;
    if (eventId === 'TRANSAK_ORDER_SUCCESSFUL') {
      this.detachTransakMessageListener();
      if (this.onrampPollingActive) return;
      this.showOnrampModal = false;
      const orderId = (data?.data?.id) || (data?.id) || (data?.webhookData?.id) || null;
      this.startOnrampPolling(orderId || undefined);
    }
  }

  private startOnramp() {
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'createPaymentUsd', type: 'onramp' } })); } catch {}
    this.showWalletModal = false;
    setTimeout(() => this.createOnrampIntent(), 0);
  }

  private async createOnrampIntent() {
    try {
      const sdk = createSdk(this.config);
      const opt = this.cryptoOptions.find(o => o.symbol === this.selectedSymbol)!;
      const canisterId = opt.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(this.selectedSymbol);
      const resp = await (sdk as any).startOnrampUsd(this.selectedAmount, canisterId, { context: 'tip:onramp' });
      const sessionId = resp?.metadata?.onramp?.sessionId || resp?.metadata?.onramp?.session_id || null;
      const paymentIntentId = resp?.metadata?.paymentIntentId || resp?.paymentIntentId || null;
      const errorMessage = resp?.metadata?.onramp?.errorMessage || null;
      this.onrampPaymentIntentId = paymentIntentId;
      if (sessionId) {
        this.onrampSessionId = sessionId;
        this.onrampErrorMessage = null;
        this.showOnrampModal = true;
        this.attachTransakMessageListener();
      } else {
        this.onrampSessionId = null;
        this.onrampErrorMessage = errorMessage || 'Failed to obtain onramp sessionId';
        this.showOnrampModal = true;
      }
    } catch (e) {
      this.onrampSessionId = null;
      this.onrampErrorMessage = (e as any)?.message || 'Failed to obtain onramp sessionId';
      this.showOnrampModal = true;
    }
  }

  private startOnrampPolling(orderId?: string) {
    if (this.onrampPollTimer) { try { clearInterval(this.onrampPollTimer); } catch {}; this.onrampPollTimer = null; }
    if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {}; this.onrampNotifyController = null; }
    const paymentIntentId = this.onrampPaymentIntentId;
    if (!paymentIntentId) return;
    const sdk = createSdk(this.config);
    const handleComplete = () => {
      this.detachTransakMessageListener();
      if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {} }
      this.onrampNotifyController = null;
      this.onrampPollingActive = false;
    };
    try { window.addEventListener('icpay-sdk-transaction-completed', (() => handleComplete()) as any, { once: true } as any); } catch {}
    this.onrampPollingActive = true;
    this.onrampNotifyController = (sdk as any).notifyIntentUntilComplete(paymentIntentId, 5000, orderId);
    this.onrampPollTimer = 1 as any;
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
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
      this.config = { ...this.config, connectedWallet: result, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
      this.showWalletModal = false;
      const action = this.pendingAction; this.pendingAction = null;
      if (action === 'tip') setTimeout(() => this.tip(), 0);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  render() {
    if (!this.config) {
      return html`<div class="icpay-card icpay-section">Loading...</div>`;
    }

    // Determine token selector visibility/mode using new string-based setting
    const optionsCount = this.cryptoOptions?.length || 0;
    const hasMultiple = optionsCount > 1;
    const rawMode = (this.config?.showLedgerDropdown as any) as ('buttons'|'dropdown'|'none'|undefined);
    const globalMode: 'buttons'|'dropdown'|'none' = rawMode === 'dropdown' ? 'dropdown' : rawMode === 'none' ? 'none' : 'buttons';
    const showSelector = (globalMode !== 'none') && (hasMultiple || globalMode === 'dropdown');
    const tokenSelectorMode: 'buttons'|'dropdown'|'none' = globalMode === 'dropdown' ? 'dropdown' : (hasMultiple ? 'buttons' : 'none');

    return html`
      <div class="icpay-card icpay-section" style="text-align:center;">
        ${this.config?.progressBar?.enabled !== false ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.selectedAmount || 0)}
            .ledgerSymbol=${this.selectedSymbol || this.config?.defaultSymbol || 'ICP'}
          ></icpay-progress-bar>
        ` : null}
        <div class="jar"><div class="fill" style="height:${this.fillPercentage}%"></div></div>
        <div class="label">Total Tips: $${this.total}</div>

        <div class="amounts">
          ${this.amounts.map(a => html`<div class="chip ${this.selectedAmount===a?'selected':''}" @click=${() => this.selectAmount(a)}>$${a}</div>`)}
        </div>

        ${showSelector ? html`
          <div>
            <icpay-token-selector
              .options=${this.cryptoOptions}
              .value=${this.selectedSymbol || ''}
              .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
              mode=${tokenSelectorMode}
              @icpay-token-change=${(e: any) => this.selectSymbol(e.detail.symbol)}
            ></icpay-token-selector>
          </div>
        ` : null}

        <button class="pay-button ${this.processing?'processing':''}"
          ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
          @click=${() => this.tip()}>
          ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : (this.config?.buttonLabel
            ? this.config.buttonLabel.replace('{amount}', String(this.selectedAmount)).replace('{symbol}', this.selectedSymbol)
            : `Tip $${this.selectedAmount} with ${this.selectedSymbol}`))}
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
          const walletsRaw = (this as any).pnp?.getEnabledWallets?.() || [];
          const wallets = walletsRaw.map((w:any)=>({ id: this.getWalletId(w), label: this.getWalletLabel(w), icon: this.getWalletIcon(w) }));
          return renderWalletSelectorModal({
            visible: !!(this.showWalletModal && this.pnp),
            wallets,
            isConnecting: false,
            onSelect: (walletId: string) => this.connectWithWallet(walletId),
            onClose: () => { this.showWalletModal = false; },
            onCreditCard: (this.config?.onramp?.enabled !== false) ? () => this.startOnramp() : undefined,
            creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
            showCreditCard: (this.config?.onramp?.enabled !== false),
            creditCardTooltip: (() => {
              const min = 5; const amt = Number(this.selectedAmount || this.config?.defaultAmountUsd || 0); if (amt > 0 && amt < min && (this.config?.onramp?.enabled !== false)) { const d = (min - amt).toFixed(2); return `Note: Minimum card amount is $${min}. You will pay about $${d} more.`; } return null;
            })(),
          });
        })()}

        ${this.showOnrampModal ? renderTransakOnrampModal({
          visible: this.showOnrampModal,
          sessionId: this.onrampSessionId,
          errorMessage: this.onrampErrorMessage,
          apiKey: this.config?.onramp?.apiKey,
          environment: (this.config?.onramp?.environment || 'STAGING') as any,
          width: this.config?.onramp?.width,
          height: this.config?.onramp?.height,
          onClose: () => { this.showOnrampModal = false; },
          onBack: () => { this.showOnrampModal = false; this.showWalletModal = true; }
        } as TransakOnrampOptions) : null}
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-tip-jar': ICPayTipJar } }


