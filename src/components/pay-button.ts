import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { PayButtonConfig, CryptoOption } from '../types';
import { renderTransakOnrampModal, TransakOnrampOptions } from './transak-onramp-modal';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';
import { renderWalletSelectorModal } from './wallet-selector-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet } from '../utils/pnp';

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
  @state() private showOnrampModal = false;
  @state() private onrampSessionId: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  private onrampPollTimer: number | null = null;
  private transakMessageHandlerBound: any | null = null;
  private pnp: any | null = null;
  private sdk: WidgetSdk | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;

  private getSdk(): WidgetSdk {
    if (!this.sdk) {
      this.sdk = createSdk(this.config);
    }
    return this.sdk;
  }

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
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Debug: observe SDK intent creation event
    try {
      window.addEventListener('icpay-sdk-transaction-created', ((e: any) => {
        debugLog(this.config?.debug || false, 'SDK transaction created', { detail: e?.detail });
      }) as EventListener);
    } catch {}
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      setTimeout(() => { if (action === 'pay') this.pay(); }, 0);
    }
    // No longer pull sessionId from config; it is obtained from SDK response
    if (changed.has('config')) {
      // Recreate SDK on config changes
      this.sdk = null;
      // Prefer defaultSymbol from config if selection not made yet
      if (!this.selectedSymbol && this.config?.defaultSymbol) {
        this.selectedSymbol = this.config.defaultSymbol;
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
      const sdk = this.getSdk();
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
      // If user wants Oisy to open in a tab, rewrite PNP config to clear window features
      const wantsOisyTab = (this.config as any)?.plugNPlay?.providers?.oisy !== false; // oisy enabled by default
      const _rawCfg: any = { ...(this.config?.plugNPlay || {}) };
      const _cfg: any = wantsOisyTab ? applyOisyNewTabConfig(_rawCfg) : _rawCfg;
      try {
        if (typeof window !== 'undefined') {
          const { resolveDerivationOrigin } = await import('../utils/origin');
          _cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
        }
      } catch {}
      this.pnp = new PlugNPlay(_cfg);
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

  private connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      if (!walletId) throw new Error('No wallet ID provided');
      // Call connect immediately within the click handler to satisfy popup policies
      const promise = this.pnp.connect(walletId);
      promise.then((result: any) => {
        debugLog(this.config?.debug || false, 'Wallet connect result', result);
        const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
        if (!isConnected) throw new Error('Wallet connection was rejected');
        this.walletConnected = true;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
        const normalized = normalizeConnectedWallet(this.pnp, result);
        this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
        this.showWalletModal = false;
        const action = this.pendingAction; this.pendingAction = null;
        if (action === 'pay') setTimeout(() => this.pay(), 0);
      }).catch((error: any) => {
        debugLog(this.config?.debug || false, 'Wallet connection error', error);
        this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
        this.errorSeverity = ErrorSeverity.ERROR;
        this.showWalletModal = false;
      });
    } catch (error) {
      debugLog(this.config?.debug || false, 'Wallet connection error (sync)', error);
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  private renderWalletModal() {
    if (!this.showWalletModal || !this.pnp) return null as any;
    const walletsRaw = this.pnp.getEnabledWallets() || [];
    const wallets = walletsRaw.map((w: any) => ({ id: this.getWalletId(w), label: this.getWalletLabel(w), icon: this.getWalletIcon(w) }));
    const onrampEnabled = (this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true);
    const minOnramp = 5;
    const amountUsd = Number(this.config?.amountUsd ?? 0);
    const showTooltip = onrampEnabled && amountUsd > 0 && amountUsd < minOnramp;
    const diff = Math.max(0, minOnramp - amountUsd);
    const tooltip = showTooltip ? `Note: Minimum card amount is $${minOnramp}. You will pay about $${diff.toFixed(2)} more.` : null;
    return renderWalletSelectorModal({
      visible: this.showWalletModal,
      wallets,
      isConnecting: false,
      onSelect: (walletId: string) => this.connectWithWallet(walletId),
      onClose: () => { this.showWalletModal = false; },
      onCreditCard: onrampEnabled ? () => this.startOnramp() : undefined,
      creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
      showCreditCard: onrampEnabled,
      creditCardTooltip: tooltip,
    });
  }

  private startOnramp() {
    // Signal to progress bar that onramp flow is starting
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'createPaymentUsd', type: 'onramp' } })); } catch {}
    this.showWalletModal = false;
    // Kick off onramp intent creation through SDK and open Transak with returned sessionId
    setTimeout(() => this.createOnrampIntent(), 0);
  }

  private async createOnrampIntent() {
    try {
      const amountUsd = Number(this.config?.amountUsd ?? 0);
      const sdk = this.getSdk();
      if (!this.selectedSymbol) this.selectedSymbol = this.config?.defaultSymbol || 'ICP';
      const symbol = this.selectedSymbol || 'ICP';
      const opt = this.cryptoOptions.find(o => o.symbol === symbol);
      const canisterId = opt?.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(symbol);
      const resp = await sdk.startOnrampUsd(amountUsd, canisterId, { context: 'pay-button:onramp' });
      const sessionId = resp?.metadata?.onramp?.sessionId || resp?.metadata?.onramp?.session_id || null;
      const errorMessage = resp?.metadata?.onramp?.errorMessage || null;
      this.onrampErrorMessage = errorMessage || null;
      const paymentIntentId = resp?.metadata?.paymentIntentId || resp?.paymentIntentId || null;
      this.onrampPaymentIntentId = paymentIntentId;
      if (sessionId) {
        this.onrampSessionId = sessionId;
        this.showOnrampModal = true;
        this.attachTransakMessageListener();
      } else {
        // Open modal in friendly error state (sessionId missing)
        this.onrampSessionId = null;
        this.showOnrampModal = true;
      }
    } catch (e) {
      // Also show friendly error modal on any error
      this.onrampSessionId = null;
      this.onrampErrorMessage = (e as any)?.message || null;
      this.showOnrampModal = true;
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

    // Only react to Transak order success
    if (eventId === 'TRANSAK_ORDER_SUCCESSFUL') {
      // Prevent multiple pollers if provider emits duplicates
      this.detachTransakMessageListener();
      if (this.onrampPollingActive) return;
      const orderId = (data?.data?.id) || (data?.id) || (data?.webhookData?.id) || null;
      // Complete steps up to verify and set confirm to loading by emitting method success events the progress bar understands
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'getLedgerBalance' } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'sendFundsToLedger' } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'notifyLedgerTransaction' } })); } catch {}

      // Close Transak modal upon success, continue with our own progress
      this.showOnrampModal = false;

      // Start polling our API for intent status
      this.startOnrampPolling(orderId || undefined);
    }
  }

  private startOnrampPolling(orderId?: string) {
    // Clear any previous polling
    if (this.onrampPollTimer) { try { clearInterval(this.onrampPollTimer); } catch {}; this.onrampPollTimer = null; }
    if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {}; this.onrampNotifyController = null; }

    const paymentIntentId = this.onrampPaymentIntentId;
    if (!paymentIntentId) return;

    const sdk = this.getSdk();
    const handleComplete = () => {
      this.detachTransakMessageListener();
      if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {} }
      this.onrampNotifyController = null;
      this.onrampPollingActive = false;
    };
    // Also listen to completion event to tidy up
    const listener = (e: any) => { handleComplete(); };
    try { window.addEventListener('icpay-sdk-transaction-completed', listener as any, { once: true } as any); } catch {}
    this.onrampPollingActive = true;
    this.onrampNotifyController = sdk.notifyIntentUntilComplete(paymentIntentId, 5000, orderId);
    // Store a no-op timer id placeholder so our cleanup path remains intact
    this.onrampPollTimer = 1 as any;
  }

  private async pay() {
    if (!isBrowser || this.processing) return;

    // Reset error state
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    // Emit method start to open progress modal and set first step
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount: this.config?.amountUsd, currency: this.selectedSymbol || this.config?.defaultSymbol } })); } catch {}

    this.processing = true;
    try {
      const ready = await this.ensureWallet();
      if (!ready) return;

      const sdk = this.getSdk();
      // Debug: snapshot wallet state before resolving canister and sending
      try {
        const cw = (this.config as any)?.connectedWallet;
        const pnpAcct = (this as any)?.pnp?.account;
        debugLog(this.config?.debug || false, 'Wallet state before payment', {
          connectedWallet: cw,
          pnpAccount: pnpAcct,
          principal: (cw?.owner || cw?.principal || pnpAcct?.owner || pnpAcct?.principal || null)
        });
      } catch {}
      if (!this.selectedSymbol) this.selectedSymbol = this.config?.defaultSymbol || 'ICP';
      const symbol = this.selectedSymbol || 'ICP';
      const opt = this.cryptoOptions.find(o => o.symbol === symbol);
      const canisterId = opt?.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(symbol);
      debugLog(this.config?.debug || false, 'Resolved ledger details', { symbol, canisterId });
      const amountUsd = Number(this.config?.amountUsd ?? 0);
      const meta = { context: 'pay-button' } as Record<string, any>;
      debugLog(this.config?.debug || false, 'Calling sdk.sendUsd', { amountUsd, canisterId, meta });
      const resp = await sdk.sendUsd(amountUsd, canisterId, meta);
      debugLog(this.config?.debug || false, 'sdk.sendUsd response', resp);
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status });
      this.succeeded = true;
      this.dispatchEvent(new CustomEvent('icpay-pay', { detail: { amount: amountUsd, tx: resp }, bubbles: true }));
    } catch (e) {
      debugLog(this.config?.debug || false, 'Payment error', {
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        stack: (e as any)?.stack
      });
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

    const optionsCount = this.cryptoOptions?.length || 0;
    const hasMultiple = optionsCount > 1;
    const rawMode = (this.config?.showLedgerDropdown as any) as ('buttons'|'dropdown'|'none'|undefined);
    const globalMode: 'buttons'|'dropdown'|'none' = rawMode === 'dropdown' ? 'dropdown' : rawMode === 'none' ? 'none' : 'buttons';
    const showSelector = (globalMode !== 'none') && (hasMultiple || globalMode === 'dropdown');
    const tokenSelectorMode: 'buttons'|'dropdown'|'none' = globalMode === 'dropdown' ? 'dropdown' : (hasMultiple ? 'buttons' : 'none');
    const selectedSymbol = this.selectedSymbol || this.config?.defaultSymbol || 'ICP';
    const amountPart = typeof this.config?.amountUsd === 'number' ? `${Number(this.config.amountUsd).toFixed(2)}` : '';
    const rawLabel = this.config?.buttonLabel || (typeof this.config?.amountUsd === 'number' ? 'Pay ${amount} with {symbol}' : 'Pay with {symbol}');
    const label = rawLabel.replace('{amount}', amountPart || '$0.00').replace('{symbol}', selectedSymbol);
    const progressEnabled = this.config?.progressBar?.enabled !== false;
    const showProgressBar = progressEnabled;

    return html`
      <div class="icpay-card icpay-section icpay-widget-base">
        ${showProgressBar ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.config?.amountUsd || 0)}
            .ledgerSymbol=${selectedSymbol}
          ></icpay-progress-bar>
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
        ${this.showOnrampModal ? renderTransakOnrampModal({
          visible: this.showOnrampModal,
          sessionId: this.onrampSessionId,
          errorMessage: this.onrampErrorMessage,
          apiKey: this.config?.onramp?.apiKey,
          apiUrl: this.config?.apiUrl,
          paymentIntentId: this.onrampPaymentIntentId,
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

declare global { interface HTMLElementTagNameMap { 'icpay-pay-button': ICPayPayButton } }


