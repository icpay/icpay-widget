import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, applyThemeVars } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import { buildWalletEntries } from '../utils/balances';
import type { TipJarConfig } from '../types';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import './ui/progress-bar';
import { renderWalletSelectorModal } from './ui/wallet-selector-modal';
import { renderOnrampModal } from './ui/onramp-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet, detectOisySessionViaAdapter } from '../utils/pnp';
import { resetPaymentFlow as resetPaymentFlowUtil } from '../utils/payment-flow-reset';
import { getWalletBalanceEntries, isEvmWalletId, ensureEvmChain } from '../utils/balances';
import { shouldSkipX402ForBaseOnIos } from '../utils/x402';
import { renderWalletBalanceModal } from './ui/wallet-balance-modal';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// wallet will be imported dynamically when needed
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

  @property({ type: Object }) config!: TipJarConfig;
  @state() private selectedAmount = 1;
  @state() private selectedSymbol: string | null = null;
  @state() private total = 0;
  @state() private processing = false;
  @state() private succeeded = false;
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'tip' | null = null;
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

  /** Ensure WalletSelect (pnp) is created with same config as wallet modal; used by generateWalletConnectQr / connectWallet. */
  private async getOrCreatePnp(): Promise<any> {
    if (this.pnp) return this.pnp;
    if (!WalletSelect) {
      const module = await import('../wallet-select');
      WalletSelect = module.WalletSelect;
    }
    const wantsOisyTab = !!((this.config as any)?.openOisyInNewTab || (this.config as any)?.plugNPlay?.openOisyInNewTab);
    const _rawCfg: any = { ...(this.config?.plugNPlay || {}) };
    const _dest = (this.config as any)?.recipientAddresses;
    if (_dest && (_dest.ic || _dest.evm || _dest.sol)) {
      const allowed: Array<'ic'|'evm'|'sol'> = [];
      if (_dest.ic) allowed.push('ic');
      if (_dest.evm) allowed.push('evm');
      if (_dest.sol) allowed.push('sol');
      if (allowed.length) _rawCfg.chainTypes = allowed as any;
    } else if ((this.config as any)?.chainTypes) {
      _rawCfg.chainTypes = (this.config as any).chainTypes;
    }
    const _cfg: any = wantsOisyTab ? applyOisyNewTabConfig(_rawCfg) : _rawCfg;
    try {
      if (typeof window !== 'undefined') {
        const { resolveDerivationOrigin } = await import('../utils/origin');
        _cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
      }
    } catch {}
    this.pnp = new WalletSelect(_cfg);
    return this.pnp;
  }

  /**
   * Pre-generate WalletConnect QR as a data URL. Host can show it in a placeholder (e.g. pay page left column).
   * When user scans and approves, the widget is updated to "connected" so Pay does not open the wallet selector.
   * hostOptions.onConnected is called when the phone wallet connects so the host can show "Connected" etc.
   * Returns the QR image as data URL, or null if WalletConnect is not enabled/available.
   */
  async generateWalletConnectQr(hostOptions?: { onConnected?: () => void }): Promise<string | null> {
    try {
      const pnp = await this.getOrCreatePnp();
      if (!pnp || typeof pnp.generateWalletConnectQr !== 'function') return null;
      return await pnp.generateWalletConnectQr({
        onConnected: (account: any) => {
          this.walletConnected = true;
          this.lastWalletId = 'walletconnect';
          const normalized = normalizeConnectedWallet(this.pnp, account);
          const evmProvider = (this.pnp as any)?.getEvmProvider?.();
          const solanaProvider = (this.pnp as any)?.getSolanaProvider?.();
          this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}), ...(solanaProvider ? { solanaProvider } : {}) } as any;
          this.sdk = null;
          try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'walletconnect' } })); } catch {}
          try { hostOptions?.onConnected?.(); } catch {}
          this.requestUpdate();
        },
      });
    } catch {
      return null;
    }
  }

  /**
   * Check if Coinbase/Base wallet is already connected (e.g. user returned from Base app deep link).
   * Host can call this on load when showing Base option on mobile to show "Connected".
   */
  async checkCoinbaseConnection(): Promise<boolean> {
    try {
      const pnp = await this.getOrCreatePnp();
      return (pnp as any)?.hasCoinbaseAccounts?.() ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Connect a specific wallet by id (e.g. 'coinbase' for Base Wallet deep link on mobile).
   * Host can use this for "Connect with Base" without opening the wallet modal.
   * Resolves when connected; rejects on error.
   */
  async connectWallet(walletId: string): Promise<void> {
    const pnp = await this.getOrCreatePnp();
    if (!pnp || !walletId) throw new Error('Wallet not available');
    const id = (walletId || '').toLowerCase();
    const result = await pnp.connect(id);
    const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || pnp.account));
    if (!isConnected) throw new Error('Wallet connection was rejected');
    this.walletConnected = true;
    this.lastWalletId = id;
    const normalized = normalizeConnectedWallet(this.pnp, result);
    const evmProvider = (this.pnp as any)?.getEvmProvider?.();
    const solanaProvider = (this.pnp as any)?.getSolanaProvider?.();
    this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}), ...(solanaProvider ? { solanaProvider } : {}) } as any;
    this.sdk = null;
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: id } })); } catch {}
    this.requestUpdate();
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Tip jar connected', { config: this.config });

    if (this.config && this.config.defaultAmountUsd) this.selectedAmount = this.config.defaultAmountUsd;
    this.tryAutoConnectPNP();
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Close wallet modal after SDK transaction creation
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
        // Resume the original action after external wallet connected
        setTimeout(() => { if (action === 'tip') this.tip(); }, 0);
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
      this.pendingAction = 'tip';
      this.showWalletModal = true;
      this.requestUpdate();
      try {
        const amount = Number(this.selectedAmount || 0);
        const curr = this.selectedSymbol || 'ICP';
        window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'tip', type: 'sendUsd', amount, currency: curr } }));
      } catch {}
    } catch {}
  };

  // Removed ledger preload

  private selectAmount(v: number) { this.selectedAmount = v; }
  private selectSymbol(s: string) { this.selectedSymbol = s; }

  private get fillPercentage() {
    const max = 50; // visual cap
    return Math.min((this.total / max) * 100, 100);
  }

  private resetPaymentFlow() {
    resetPaymentFlowUtil(this, { pendingAction: 'tip' });
  }

  private async tip() {
    if (!isBrowser) return;

    this.resetPaymentFlow();

    debugLog(this.config?.debug || false, 'Tip button clicked!', { config: this.config, processing: this.processing });

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'tip', type: 'sendUsd', amount: this.selectedAmount, currency: this.selectedSymbol || 'ICP' } })); } catch {}

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
        // Built-in wallet handling - connect directly with wallet
        if (!this.walletConnected) {
          debugLog(this.config?.debug || false, 'Connecting to wallet via wallet');
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
                this.tip();
                return;
              }
            } catch {}
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
      const resp = await (sdk as any).startOnrampUsd(this.selectedAmount, undefined, { context: 'tip:onramp', onrampPayment: true, onrampProvider: (this as any)?.selectedOnrampProvider || 'coinbase' });
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
        (this as any).onrampUrl = url;
        this.onrampErrorMessage = null;
        try {
          window.open(url, 'icpay_onramp', 'noopener,noreferrer');
          try { window.dispatchEvent(new CustomEvent('icpay-onramp-opened', { detail: { url } })); } catch {}
        } catch {}
        this.startOnrampPolling();
      } else {
        (this as any).onrampUrl = null;
        this.onrampErrorMessage = errorMessage || 'Failed to obtain onramp sessionId';
        this.showOnrampModal = true;
      }
    } catch (e) {
      (this as any).onrampUrl = null;
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
        fiatCurrency: (this.config as any)?.fiat_currency,
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
          if (sel?.x402Accepts && !shouldSkipX402ForBaseOnIos(this.lastWalletId)) {
            try {
              await (sdk.client as any).createPaymentX402Usd({
                usdAmount: amountUsd,
                tokenShortcode: (sel as any)?.tokenShortcode,
              metadata: {
                ...(this.config as any)?.metadata,
                icpay: {
                  ...(((this.config as any)?.metadata || {})?.icpay || {}),
                  icpay_network: 'evm',
                  icpay_ledger_id: sel?.ledgerId,
                  icpay_context: 'tip:x402'
                }
              },
                recipientAddress: ((((this.config as any)?.recipientAddresses) || {})?.evm) || '0x0000000000000000000000000000000000000000',
                fiat_currency: (this.config as any)?.fiat_currency,
              });
              this.showBalanceModal = false;
              return;
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
            }
          }
          await (sdk.client as any).createPaymentUsd({
            usdAmount: amountUsd,
            tokenShortcode: (sel as any)?.tokenShortcode,
            metadata: {
              ...(this.config as any)?.metadata,
            icpay: {
              ...(((this.config as any)?.metadata || {})?.icpay || {}),
              icpay_network: 'evm',
              icpay_ledger_id: sel?.ledgerId
            }
            },
            recipientAddress: ((((this.config as any)?.recipientAddresses) || {})?.evm) || '0x0000000000000000000000000000000000000000',
          }).catch((err: any) => { throw err; });
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
        }
        this.showBalanceModal = false;
      });
      return;
    }
    const action = this.pendingAction; this.pendingAction = null;
    if (action === 'tip') {
      // IC/SOL flow: prefer x402 for Solana tokens when available
      try {
        const sel = (this.walletBalances || []).find((b: any) => (b as any)?.tokenShortcode === shortcode);
        const sdk = createSdk(this.config);
        const amountUsd = Number(this.selectedAmount || 0);
        const chainName = String((sel as any)?.ledgerName || (sel as any)?.chainName || '').toLowerCase();
        const isSol = chainName.includes('sol');
        const isIc = chainName.includes('ic');
        const dest = (this.config as any)?.recipientAddresses || {};
        const chosen = isSol ? (dest.sol || dest.ic) : (dest.ic);
        if ((sel as any)?.x402Accepts) {
          try {
            await (sdk.client as any).createPaymentX402Usd({
              usdAmount: amountUsd,
              tokenShortcode: (sel as any)?.tokenShortcode,
              metadata: {
                ...(this.config as any)?.metadata,
                icpay: {
                  ...(((this.config as any)?.metadata || {})?.icpay || {}),
                  icpay_network: isSol ? 'sol' : (isIc ? 'ic' : (this.config as any)?.icpay_network),
                  icpay_ledger_id: sel?.ledgerId,
                  icpay_context: 'tip:x402'
                }
              },
              recipientAddress: chosen || '',
              fiat_currency: (this.config as any)?.fiat_currency,
            });
            return;
          } catch (e) {
            // No fallback to normal flow for Solana x402; surface error
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
        }).catch((err: any) => { throw err; });
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
      }
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
        <div class="jar"><div class="fill" style="height:${this.fillPercentage}%"></div></div>
        <div class="label">Total Tips: $${this.total}</div>

        <div class="amounts">
          ${this.amounts.map(a => html`<div class="chip ${this.selectedAmount===a?'selected':''}" @click=${() => this.selectAmount(a)}>$${a}</div>`)}
        </div>



        <button class="pay-button ${this.processing?'processing':''}"
          ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
          @click=${() => this.tip()}>
          ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : (this.config?.buttonLabel
            ? this.config.buttonLabel.replace('{amount}', String(this.selectedAmount)).replace('{symbol}', (this.selectedSymbol || 'ICP'))
            : `Tip $${this.selectedAmount} with crypto`))}
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
            onOisyPay: () => { this.showWalletModal = false; this.oisyReadyToPay = false; this.tip(); },
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
              url: (this as any).onrampUrl || undefined,
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

declare global { interface HTMLElementTagNameMap { 'icpay-tip-jar': ICPayTipJar } }


