import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { AmountInputConfig, CryptoOption } from '../types';
import { createSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';
import { renderWalletSelectorModal } from './wallet-selector-modal';
import { renderTransakOnrampModal, TransakOnrampOptions } from './transak-onramp-modal';

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

@customElement('icpay-amount-input')
export class ICPayAmountInput extends LitElement {
  static styles = [baseStyles, css`
    .row { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: stretch; }
    .top-row { display: grid; grid-template-columns: 1fr; gap: 10px; align-items: center; }
    .top-row.with-selector { grid-template-columns: 1fr 2fr; }
    icpay-token-selector { width: 100%; }
    .amount-field { position: relative; width: 100%; }
    .amount-field .currency-prefix { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--icpay-muted, #a3a3a3); font-weight: 600; pointer-events: none; z-index: 2; }
    .amount-field input[type="number"] { padding-left: 32px; position: relative; z-index: 1; }
    input[type="number"] { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); color: var(--icpay-text); border-radius: 8px; padding: 10px; font-weight: 600; width: 100%; box-sizing: border-box; height: 54px; }
    select { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); color: var(--icpay-text); border-radius: 8px; padding: 10px; font-weight: 600; }
    .pay-button { width: 100%; }
    .error-message { border: 1px solid; font-weight: 500; }
    .error-message.info { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
    .error-message.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #f59e0b; }
    .error-message.error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
    .hint { font-size: 12px; color: var(--icpay-muted); margin-top: 6px; }

    @media (max-width: 520px) {
      .top-row { grid-template-columns: 1fr; }
    }
  `];

  @property({ type: Object }) config!: AmountInputConfig;
  @state() private amountUsd: number = 0;
  @state() private hasUserAmount: boolean = false;
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
  @state() private showOnrampModal = false;
  @state() private onrampSessionId: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  private pnp: any | null = null;
  private transakMessageHandlerBound: any | null = null;
  private onrampPollTimer: number | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;

  private get cryptoOptions(): CryptoOption[] {
    if (this.config?.cryptoOptions?.length) return this.config.cryptoOptions;
    return this.availableLedgers;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return;
    debugLog(this.config?.debug || false, 'Amount input connected', { config: this.config });
    this.amountUsd = Number(this.config?.defaultAmountUsd ?? 0);
    this.hasUserAmount = false;
    // Always fetch verified ledgers by default when cryptoOptions not provided
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
    if (this.config?.defaultSymbol) this.selectedSymbol = this.config.defaultSymbol;
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config')) {
      // Apply defaults only if user hasn't edited the amount
      if (!this.hasUserAmount && typeof this.config?.defaultAmountUsd === 'number') {
        if (this.amountUsd === 0 || this.amountUsd == null || Number.isNaN(this.amountUsd)) {
          this.amountUsd = Number(this.config.defaultAmountUsd);
        }
      }
      if (!this.selectedSymbol && this.config?.defaultSymbol) {
        this.selectedSymbol = this.config.defaultSymbol;
      }

      // Ensure ledgers are loaded if dropdown is enabled and no options provided
      if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0) && this.availableLedgers.length === 0) {
        this.loadVerifiedLedgers();
      }

      // If we were waiting on wallet connect, resume action
      if (this.pendingAction && this.config?.actorProvider) {
        const action = this.pendingAction;
        this.pendingAction = null;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
        setTimeout(() => { if (action === 'pay') this.pay(); }, 0);
      }
    }
  }

  private onSwitchAccount = async (e: any) => {
    try {
      if (!this.pnp) return;
      await this.pnp.disconnect();
      const type = (e?.detail?.walletType || '').toLowerCase();
      if (type === 'ii') {
        try { window.open('https://identity.ic0.app/', '_blank', 'noopener,noreferrer'); } catch {}
      }
      this.pendingAction = 'pay';
      this.walletConnected = false;
      this.showWalletModal = true;
      this.requestUpdate();
    } catch {}
  };

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

  private onInputChange(e: any) {
    const step = Number(this.config?.stepUsd ?? 0.5);
    const value = Math.max(0, Number(e.target.value || 0));
    const rounded = Math.round(value / step) * step;
    this.amountUsd = Number(rounded.toFixed(2));
    this.hasUserAmount = true;
  }

  private selectSymbol(symbol: string) { this.selectedSymbol = symbol; }

  private isValidAmount(): boolean {
    const min = Number(this.config?.minUsd ?? 0.5);
    const max = this.config?.maxUsd !== undefined ? Number(this.config.maxUsd) : Infinity;
    return this.amountUsd >= min && this.amountUsd <= max;
  }

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
      const _cfg: any = { ...(this.config?.plugNPlay || {}) };
      try {
        if (typeof window !== 'undefined') {
          const { resolveDerivationOrigin } = await import('../utils/origin');
          _cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
        }
      } catch {}
      this.pnp = new PlugNPlay(_cfg);
      const availableWallets = this.pnp.getEnabledWallets();
      if (!availableWallets?.length) throw new Error('No wallets available');
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
      if (!walletId) throw new Error('No wallet ID provided');
      const result = await this.pnp.connect(walletId);
      const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
      if (!isConnected) throw new Error('Wallet connection was rejected');
      this.walletConnected = true;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
      this.config = { ...this.config, connectedWallet: result, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
      this.showWalletModal = false;
      const action = this.pendingAction; this.pendingAction = null;
      if (action === 'pay') setTimeout(() => this.pay(), 0);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
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
      // Close modal and start our own flow
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
      const symbol = this.selectedSymbol || this.config?.defaultSymbol || 'ICP';
      const opt = this.cryptoOptions.find(o => o.symbol === symbol);
      const canisterId = opt?.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(symbol);
      const amountUsd = Number(this.amountUsd);
      const resp = await (sdk as any).startOnrampUsd(amountUsd, canisterId, { context: 'amount-input:onramp' });
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

  private async pay() {
    if (!isBrowser || this.processing) return;

    // Reset error state
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    if (!this.isValidAmount()) {
      this.errorMessage = 'Please enter a valid amount';
      this.errorSeverity = ErrorSeverity.WARNING;
      return;
    }

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount: this.amountUsd, currency: this.selectedSymbol || this.config?.defaultSymbol } })); } catch {}

    this.processing = true;
    try {
      const ready = await this.ensureWallet();
      if (!ready) return;

      const sdk = createSdk(this.config);
      const symbol = this.selectedSymbol || this.config?.defaultSymbol || 'ICP';
      const opt = this.cryptoOptions.find(o => o.symbol === symbol);
      const canisterId = opt?.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(symbol);
      const amountUsd = Number(this.amountUsd);
      const meta = { context: 'amount-input' } as Record<string, any>;

      const resp = await sdk.sendUsd(amountUsd, canisterId, meta);
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status, amountUsd });
      this.succeeded = true;
      this.dispatchEvent(new CustomEvent('icpay-amount-pay', { detail: { amount: amountUsd, tx: resp }, bubbles: true }));
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
      // On failure, disconnect so next attempt triggers wallet selection again
      try {
        if (!this.config.useOwnWallet && this.pnp) {
          await this.pnp.disconnect?.();
          this.walletConnected = false;
          this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
        }
      } catch {}
    } finally {
      this.processing = false;
    }
  }

  render() {
    if (!this.config) return html`<div class="icpay-card icpay-section">Loading...</div>`;
    const placeholder = this.config?.placeholder || 'Enter amount in USD';
    const payLabelRaw = this.config?.buttonLabel || 'Pay ${amount} with {symbol}';
    const payLabel = payLabelRaw
      .replace('{amount}', this.amountUsd ? `${Number(this.amountUsd).toFixed(2)}` : '$0.00')
      .replace('{symbol}', this.selectedSymbol || (this.config?.defaultSymbol || 'ICP'));
    const selectedLabel =
      (this.cryptoOptions.find(o => o.symbol === (this.selectedSymbol||''))?.label)
      || (this.cryptoOptions[0]?.label)
      || (this.config?.defaultSymbol || 'ICP');
    const mode = this.config?.progressBar?.mode || 'modal';
    const rawMode = (this.config?.showLedgerDropdown as any) as ('buttons'|'dropdown'|'none'|boolean|undefined);
    const globalMode: 'buttons'|'dropdown'|'none' = rawMode === 'buttons' ? 'buttons' : rawMode === 'none' ? 'none' : 'dropdown';
    const optionsCount = this.cryptoOptions?.length || 0;
    const hasMultiple = optionsCount > 1;
    const showSelector = (globalMode !== 'none') && (hasMultiple || globalMode === 'dropdown');
    const tokenSelectorMode: 'buttons'|'dropdown'|'none' = globalMode === 'dropdown' ? 'dropdown' : (hasMultiple ? 'buttons' : 'none');
    const progressEnabled = this.config?.progressBar?.enabled !== false;
    const showProgressBar = progressEnabled && (mode === 'modal' ? true : this.processing);

    return html`
      <div class="icpay-card icpay-section icpay-widget-base">
        ${showProgressBar ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.amountUsd || 0)}
            .ledgerSymbol=${this.selectedSymbol || this.config?.defaultSymbol || 'ICP'}
          ></icpay-progress-bar>
        ` : null}

        <div class="row">
          <div class="top-row ${showSelector ? 'with-selector' : ''}">
            <div class="amount-field">
              <span class="currency-prefix">$</span>
              <input type="number" min="0" step="${Number(this.config?.stepUsd ?? 0.5)}" .value=${String(this.amountUsd || '')} placeholder="${placeholder}" @input=${(e: any) => this.onInputChange(e)} />
            </div>
            ${showSelector ? html`
              <icpay-token-selector
                .options=${this.cryptoOptions}
                .value=${this.selectedSymbol || ''}
                .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
                mode=${tokenSelectorMode}
                .showLabel=${false}
                @icpay-token-change=${(e: any) => this.selectSymbol(e.detail.symbol)}
              ></icpay-token-selector>
            ` : null}
          </div>
          <button class="pay-button ${this.processing?'processing':''}"
            ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
            @click=${() => this.pay()}>
            ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : payLabel)}
          </button>
        </div>
        <div class="hint">Default: ${this.config?.defaultSymbol || 'ICP'}. Min: $${Number(this.config?.minUsd ?? 0.5).toFixed(2)}${this.config?.maxUsd ? `, Max: $${Number(this.config.maxUsd).toFixed(2)}` : ''}</div>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`<button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">${this.errorAction}</button>` : ''}
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
            onCreditCard: ((this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true)) ? () => this.startOnramp() : undefined,
            creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
            showCreditCard: (this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true),
            creditCardTooltip: (() => {
              const min = 5; const amt = Number(this.amountUsd || 0); if (amt > 0 && amt < min && ((this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true))) { const d = (min - amt).toFixed(2); return `Note: Minimum card amount is $${min}. You will pay about $${d} more.`; } return null;
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

declare global { interface HTMLElementTagNameMap { 'icpay-amount-input': ICPayAmountInput } }


