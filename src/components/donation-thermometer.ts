import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import { buildWalletEntries } from '../utils/balances';
import type { DonationThermometerConfig } from '../types';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import './ui/progress-bar';
import { renderWalletSelectorModal } from './ui/wallet-selector-modal';
import { renderOnrampModal } from './ui/onramp-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet, detectOisySessionViaAdapter } from '../utils/pnp';
import { getWalletBalanceEntries, isEvmWalletId, ensureEvmChain } from '../utils/balances';
import { renderWalletBalanceModal } from './ui/wallet-balance-modal';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Plug N Play will be imported dynamically when needed
let WalletSelect: any = null;

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

@customElement('icpay-donation-thermometer')
export class ICPayDonationThermometer extends LitElement {
  static styles = [baseStyles, css`
    .thermo { width: 60px; height: 200px; background: var(--icpay-surface-alt); border: 3px solid #6b7280; border-radius: 30px; margin: 0 auto 12px; position: relative; overflow: hidden; }
    .fill { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%); transition: height 0.8s ease; height: 0%; border-radius: 0 0 27px 27px; }
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
      background: var(--icpay-processing-bg);
      border-color: var(--icpay-processing-border);
      color: var(--icpay-processing-text);
    }

    .error-message.warning {
      background: var(--icpay-warning-bg);
      border-color: var(--icpay-warning-border);
      color: var(--icpay-warning-text);
    }

    .error-message.error {
      background: var(--icpay-error-bg);
      border-color: var(--icpay-error-border);
      color: var(--icpay-error-text);
    }
  `];

  @property({ type: Object }) config!: DonationThermometerConfig;
  @state() private selectedAmount = 10;
  @state() private selectedSymbol: string | null = null;
  @state() private raised = 0;
  @state() private processing = false;
  @state() private succeeded = false;
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'donate' | null = null;
  @state() private showWalletModal = false;
  @state() private walletModalStep: 'connect' | 'balances' = 'connect';
  @state() private oisyReadyToPay: boolean = false;
  @state() private lastWalletId: string | null = null;
  private pnp: any | null = null;
  @state() private showOnrampModal = false;
  @state() private onrampUrl: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  private transakMessageHandlerBound: any | null = null;
  private onrampPollTimer: number | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;
  private sdk: WidgetSdk | null = null;
  // Integrated balances
  @state() private showBalanceModal = false;
  @state() private balancesLoading = false;
  @state() private balancesError: string | null = null;
  @state() private walletBalances: any[] = [];
  private async tryAutoConnectPNP() {
    try {
      if (!this.config || this.config?.useOwnWallet) return;
      const raw = localStorage.getItem('icpay:pnp');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.provider || !saved?.principal) return;
      if (!WalletSelect) {
        const module = await import('../wallet-select');
        WalletSelect = module.WalletSelect;
      }
      const _cfg1: any = applyOisyNewTabConfig({ ...(this.config?.plugNPlay || {}) });
      try {
        if (typeof window !== 'undefined') {
          const { resolveDerivationOrigin } = await import('../utils/origin');
          _cfg1.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
        }
      } catch {}
      const pnp = new WalletSelect(_cfg1);
      // Hydrate saved principal for UI/history; require connect on pay
      this.walletConnected = false;
      this.config = {
        ...this.config,
        connectedWallet: { owner: saved.principal, principal: saved.principal, connected: false } as any
      };
    } catch {}
  }

  private get amounts(): number[] {
    return this.config?.amountsUsd || [10, 25, 50, 100, 250, 500];
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Donation thermometer connected', { config: this.config });

    if (this.config && typeof this.config.defaultAmountUsd === 'number') this.selectedAmount = this.config.defaultAmountUsd;
    this.tryAutoConnectPNP();
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Close wallet modal after SDK transaction created
    try {
      window.addEventListener('icpay-sdk-transaction-created', (() => {
        this.showWalletModal = false;
        this.requestUpdate();
      }) as EventListener);
    } catch {}
    // No ledger preload; balances flow handles token availability
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      // Do NOT auto-continue if we're already in balances step; wait for user to pick a token
      if (this.walletModalStep !== 'balances' && !this.oisyReadyToPay) {
        this.pendingAction = null;
        setTimeout(() => { if (action === 'donate') this.donate(); }, 0);
      }
    }
  }

  private onSwitchAccount = async (e: any) => {
    try {
      if (this.pnp) {
        try { await this.pnp.disconnect(); } catch {}
      }
      this.walletConnected = false;
      this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
      this.pendingAction = 'donate';
      this.showWalletModal = true;
      this.requestUpdate();
      try {
        const amount = Number(this.selectedAmount || 0);
        const curr = this.selectedSymbol || 'ICP';
        window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'donate', type: 'sendUsd', amount, currency: curr } }));
      } catch {}
    } catch {}
  };

  // Removed ledger preload

  private selectAmount(v: number) { this.selectedAmount = v; }
  private selectSymbol(s: string) { this.selectedSymbol = s; }

  private get fillPercentage() {
    const goal = Number(this.config?.goalUsd ?? 1000);
    const denom = goal > 0 ? goal : 1000;
    return Math.min((this.raised / denom) * 100, 100);
  }

  private async donate() {
    if (!isBrowser) return; // Skip in SSR

    if (this.processing) return;

    debugLog(this.config?.debug || false, 'Donation started', {
      amount: this.selectedAmount,
      selectedSymbol: this.selectedSymbol,
      useOwnWallet: this.config.useOwnWallet
    });

    // Clear previous errors
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'donate', type: 'sendUsd', amount: this.selectedAmount, currency: this.selectedSymbol || 'ICP' } })); } catch {}

    this.processing = true;
    try {
      // Check wallet connection status first
      if (this.config.useOwnWallet) {
        if (!this.config.actorProvider) {
          this.pendingAction = 'donate';
          this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
          return;
        }
      } else {
        // Built-in wallet handling - connect directly with Plug N Play
        if (!this.walletConnected) {
          debugLog(this.config?.debug || false, 'Connecting to wallet via Plug N Play');
          try {
            if (!WalletSelect) { const module = await import('../wallet-select'); WalletSelect = module.WalletSelect; }
            const wantsOisyTab = !!((this.config as any)?.openOisyInNewTab || (this.config as any)?.plugNPlay?.openOisyInNewTab);
            const _cfg2: any = wantsOisyTab ? applyOisyNewTabConfig({ ...(this.config?.plugNPlay || {}) }) : ({ ...(this.config?.plugNPlay || {}) });
            if ((this.config as any)?.chainTypes) _cfg2.chainTypes = (this.config as any).chainTypes;
            try {
              if (typeof window !== 'undefined') {
                const { resolveDerivationOrigin } = await import('../utils/origin');
                _cfg2.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
              }
            } catch {}
            this.pnp = new WalletSelect(_cfg2);
            try {
              const principal = await detectOisySessionViaAdapter(this.pnp);
              if (principal) {
                this.walletConnected = true;
                const normalized = normalizeConnectedWallet(this.pnp, { owner: principal, principal, connected: true });
                const evmProvider = (this.pnp as any)?.getEvmProvider?.();
                this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}) } as any;
                this.sdk = null;
                try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'oisy' } })); } catch {}
                this.donate();
                return;
              }
            } catch {}
            const availableWallets = this.pnp.getEnabledWallets();
            debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
            if (!availableWallets?.length) throw new Error('No wallets available');
            this.pendingAction = 'donate';
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

      // Wallet is connected; proceed to token selection to initiate payment via selection handler
      this.showWalletModal = true;
      await this.fetchAndShowBalances();
      return;
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
      const resp = await (sdk as any).startOnrampUsd(this.selectedAmount, undefined, { context: 'donation:onramp', onrampPayment: true, onrampProvider: 'coinbase' });
      const url =
        resp?.metadata?.onramp?.url ||
        resp?.onramp?.url ||
        resp?.metadata?.icpay_onramp?.url ||
        resp?.paymentIntent?.metadata?.icpay?.onrampUrl ||
        resp?.metadata?.icpay?.onrampUrl ||
        null;
      const paymentIntentId = resp?.metadata?.icpay_payment_intent_id || resp?.metadata?.paymentIntentId || resp?.paymentIntentId || null;
      const errorMessage =
        resp?.metadata?.icpay_onramp?.errorMessage ||
        resp?.metadata?.onramp?.errorMessage ||
        resp?.paymentIntent?.metadata?.icpay?.onrampError ||
        resp?.paymentIntent?.metadata?.icpay?.errorMessage ||
        resp?.metadata?.icpay?.onrampError ||
        resp?.metadata?.icpay?.errorMessage ||
        null;
      this.onrampPaymentIntentId = paymentIntentId;
      if (url) {
        this.onrampUrl = url;
        this.onrampErrorMessage = null;
        try {
          window.open(url, 'icpay_onramp', 'noopener,noreferrer');
          try { window.dispatchEvent(new CustomEvent('icpay-onramp-opened', { detail: { url } })); } catch {}
        } catch {}
        this.startOnrampPolling();
      } else {
        this.onrampUrl = null;
        this.onrampErrorMessage = errorMessage || 'Failed to obtain onramp URL';
        this.showOnrampModal = true;
      }
    } catch (e) {
      this.onrampUrl = null;
      this.onrampErrorMessage = (e as any)?.message || 'Failed to obtain onramp URL';
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

  private connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      if (!walletId) throw new Error('No wallet ID provided');
      this.lastWalletId = (walletId || '').toLowerCase();
      const promise = this.pnp.connect(walletId);
      promise.then((result: any) => {
        const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
        if (!isConnected) throw new Error('Wallet connection was rejected');
        this.walletConnected = true;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
        const normalized = normalizeConnectedWallet(this.pnp, result);
        const evmProvider = (this.pnp as any)?.getEvmProvider?.();
        const solanaProvider = (this.pnp as any)?.getSolanaProvider?.();
        this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}), ...(solanaProvider ? { solanaProvider } : {}) } as any;
        this.sdk = null;
        // After any successful wallet connect (including Oisy), open token-balance picker inside wallet modal
        this.walletModalStep = 'balances';
        this.showBalanceModal = false;
        this.showWalletModal = true;
        this.fetchAndShowBalances();
      }).catch((error: any) => {
        this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
        this.errorSeverity = ErrorSeverity.ERROR;
        this.showWalletModal = false;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
      });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
    }
  }

  private async fetchAndShowBalances() {
    try {
      this.balancesLoading = true;
      this.balancesError = null;
      // Integrated into wallet modal
      this.walletModalStep = 'balances';
      this.showBalanceModal = false;
      const sdk = createSdk(this.config);
      const { balances } = await getWalletBalanceEntries({
        sdk,
        lastWalletId: this.lastWalletId,
        connectedWallet: (this.config as any)?.connectedWallet,
        amountUsd: Number(this.selectedAmount || 0),
        chainShortcodes: (this.config as any)?.chainShortcodes,
        tokenShortcodes: (this.config as any)?.tokenShortcodes,
      });
      this.walletBalances = balances as any[];
    } catch (e: any) {
      this.walletBalances = [];
      this.balancesError = (e && (e.message || String(e))) || 'Failed to load balances';
    } finally {
      this.balancesLoading = false;
    }
  }

  private onSelectBalanceSymbol = async (shortcode: string) => {
    const sel = (this.walletBalances || []).find((b: any) => (b as any)?.tokenShortcode === shortcode);
    if (sel?.ledgerSymbol) this.selectedSymbol = sel.ledgerSymbol;
    // Close wallet modal before starting progress to reveal progress bar
    this.showBalanceModal = false;
    this.showWalletModal = false;
    if (isEvmWalletId(this.lastWalletId)) {
      const sel = (this.walletBalances || []).find((b: any) => (b as any)?.tokenShortcode === shortcode);
      const targetChain = sel?.chainId;
      ensureEvmChain(targetChain, { provider: (this.pnp as any)?.getEvmProvider?.() || (this.config as any)?.evmProvider, chainName: sel?.chainName, rpcUrlPublic: (sel as any)?.rpcUrlPublic, nativeSymbol: sel?.ledgerSymbol, decimals: sel?.decimals }).then(async () => {
        try {
          const sdk = createSdk(this.config);
          const amountUsd = Number(this.selectedAmount || 0);
          if (sel?.x402Accepts) {
            try {
              await (sdk.client as any).createPaymentX402Usd({
                usdAmount: amountUsd,
                tokenShortcode: (sel as any)?.tokenShortcode,
                metadata: {
                  ...(this.config as any)?.metadata,
                  icpay_network: 'evm',
                  icpay_ledger_id: sel?.ledgerId,
                  icpay_context: 'donation:x402'
                },
                recipientAddress: ((((this.config as any)?.recipientAddresses) || {})?.evm) || '0x0000000000000000000000000000000000000000',
              });
              this.showBalanceModal = false;
              return;
            } catch {}
          }
          await (sdk.client as any).createPaymentUsd({
            usdAmount: amountUsd,
            tokenShortcode: (sel as any)?.tokenShortcode,
            metadata: {
              ...(this.config as any)?.metadata,
              icpay_network: 'evm',
              icpay_ledger_id: sel?.ledgerId
            },
            recipientAddress: ((((this.config as any)?.recipientAddresses) || {})?.evm) || '0x0000000000000000000000000000000000000000',
          });
        } catch {}
        this.showBalanceModal = false;
      });
      return;
    }
    const action = this.pendingAction; this.pendingAction = null;
    if (action === 'donate') {
      // IC/SOL flow: prefer x402 for Solana tokens when available
      try {
        const sel = (this.walletBalances || []).find((b: any) => (b as any)?.tokenShortcode === shortcode);
        const sdk = createSdk(this.config);
        const amountUsd = Number(this.selectedAmount || 0);
        const chainName = String((sel as any)?.ledgerName || (sel as any)?.chainName || '').toLowerCase();
        const isSol = chainName.includes('sol');
        const dest = (this.config as any)?.recipientAddresses || {};
        const chosen = isSol ? (dest.sol || dest.ic) : (dest.ic);
        if (isSol && (sel as any)?.x402Accepts) {
          try {
            await (sdk.client as any).createPaymentX402Usd({
              usdAmount: amountUsd,
              tokenShortcode: (sel as any)?.tokenShortcode,
              metadata: {
                ...(this.config as any)?.metadata,
              icpay: {
                ...(((this.config as any)?.metadata || {})?.icpay || {}),
                icpay_network: 'sol',
                icpay_ledger_id: sel?.ledgerId,
                icpay_context: 'donation:x402'
              }
              },
              recipientAddress: chosen || '',
            });
            return;
          } catch {
            // No fallback to normal flow for Solana x402
            return;
          }
        }
        await (sdk.client as any).createPaymentUsd({
          usdAmount: amountUsd,
          tokenShortcode: (sel as any)?.tokenShortcode,
          metadata: {
            ...(this.config as any)?.metadata,
          icpay: {
            ...(((this.config as any)?.metadata || {})?.icpay || {}),
            icpay_network: 'ic',
            icpay_ledger_id: sel?.ledgerId
          }
          },
          recipientAddress: chosen || '0x0000000000000000000000000000000000000000',
        });
      } catch {}
    }
  };

  render() {
    if (!this.config) {
      return html`<div class="icpay-card icpay-section">Loading...</div>`;
    }

    return html`
      <div class="icpay-card icpay-section icpay-widget-base" style="text-align:center;">
        ${this.config?.progressBar?.enabled !== false ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.selectedAmount || 0)}
            .ledgerSymbol=${this.selectedSymbol || 'ICP'}
          ></icpay-progress-bar>
        ` : null}
        <div class="thermo"><div class="fill" style="height:${this.fillPercentage}%"></div></div>
        <div class="total">$${Number(this.raised).toFixed(0)} / $${Number(this.config?.goalUsd ?? 0).toFixed(2)}</div>

        <div class="amounts">
          ${this.amounts.map(a => html`<div class="chip ${this.selectedAmount===a?'selected':''}" @click=${() => this.selectAmount(a)}>$${a}</div>`)}
        </div>



        <button class="pay-button ${this.processing?'processing':''}"
          ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
          @click=${() => this.donate()}>
          ${this.succeeded && this.config?.disableAfterSuccess ? 'Donated' : (this.processing ? 'Processing…' : (
            (this.config?.buttonLabel || 'Donate {amount} with crypto')
              .replace('{amount}', `${this.selectedAmount}`)
              .replace('{symbol}', (this.selectedSymbol || 'ICP'))
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
          const walletsRaw = (this as any).pnp?.getEnabledWallets?.() || [];
          const wallets = (buildWalletEntries as any)(walletsRaw);
          const themeMode = this.config?.theme ? (typeof this.config.theme === 'string' ? this.config.theme : (this.config.theme.mode || 'light')) : undefined;
          return renderWalletSelectorModal({
            visible: !!(this.showWalletModal && this.pnp),
            wallets,
            isConnecting: false,
          step: this.walletModalStep,
          balances: this.walletModalStep === 'balances' ? this.walletBalances as any : [],
          balancesLoading: this.walletModalStep === 'balances' ? this.balancesLoading : false,
          balancesError: this.walletModalStep === 'balances' ? this.balancesError : null,
          onSelectBalance: (s: string) => this.onSelectBalanceSymbol(s),
          onBack: () => { this.walletModalStep = 'connect'; },
            onSwitchAccount: () => this.onSwitchAccount(null),
            onSelect: (walletId: string) => this.connectWithWallet(walletId),
            onClose: () => { this.showWalletModal = false; this.oisyReadyToPay = false; try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-cancelled', { detail: { reason: 'user_cancelled' } })); } catch {} },
            onDismiss: () => { this.showWalletModal = false; this.oisyReadyToPay = false; }, // Close without triggering cancellation events
            onCreditCard: ((this.config?.onramp?.enabled === true) && (this.config?.onrampDisabled !== true)) ? () => this.startOnramp() : undefined,
            creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
            showCreditCard: (this.config?.onramp?.enabled === true) && (this.config?.onrampDisabled !== true),
            creditCardTooltip: (() => {
              const min = 5; const amt = Number(this.selectedAmount || this.config?.defaultAmountUsd || 0); if (amt > 0 && amt < min && ((this.config?.onramp?.enabled === true) && (this.config?.onrampDisabled !== true))) { const d = (min - amt).toFixed(2); return `Note: Minimum card amount is $${min}. You will pay about $${d} more.`; } return null;
            })(),
            oisyReadyToPay: this.oisyReadyToPay,
            onOisyPay: () => { this.showWalletModal = false; this.oisyReadyToPay = false; this.donate(); },
            theme: themeMode
          });
        })()}

        ${(() => {
          const themeMode = this.config?.theme ? (typeof this.config.theme === 'string' ? this.config.theme : (this.config.theme.mode || 'light')) : undefined;
          return html`
            ${renderWalletBalanceModal({
              visible: this.showBalanceModal,
              isLoading: this.balancesLoading,
              error: this.balancesError,
              balances: this.walletBalances as any,
              onSelect: (s: string) => this.onSelectBalanceSymbol(s),
              onClose: () => { this.showBalanceModal = false; },
              theme: themeMode
            })}

            ${renderOnrampModal({
              visible: this.showOnrampModal,
              url: this.onrampUrl || undefined,
              errorMessage: this.onrampErrorMessage || undefined,
              width: this.config?.onramp?.width,
              height: this.config?.onramp?.height,
              onClose: () => { this.showOnrampModal = false; },
              onBack: () => { this.showOnrampModal = false; this.showWalletModal = true; },
              title: 'Pay with credit card',
              theme: themeMode
            })}
          `;
        })()}
        <div class="icpay-powered-by">
          <a href="https://icpay.org" target="_blank" rel="noopener noreferrer">Powered by icpay</a>
        </div>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-donation-thermometer': ICPayDonationThermometer } }


