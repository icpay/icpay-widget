import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, applyThemeVars } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { AmountInputConfig } from '../types';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import { buildWalletEntries } from '../utils/balances';
import './ui/progress-bar';
import { getWalletBalanceEntries, isEvmWalletId, ensureEvmChain } from '../utils/balances';
import { renderWalletBalanceModal } from './ui/wallet-balance-modal';
import { renderWalletSelectorModal } from './ui/wallet-selector-modal';
import { renderOnrampModal } from './ui/onramp-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet, detectOisySessionViaAdapter } from '../utils/pnp';
import { clientSupportsX402 } from '../utils/x402';
import { resetPaymentFlow as resetPaymentFlowUtil, type PaymentFlowResetContext } from '../utils/payment-flow-reset';

const isBrowser = typeof window !== 'undefined';
let WalletSelect: any = null;

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
    .error-message.info { background: var(--icpay-processing-bg); border-color: var(--icpay-processing-border); color: var(--icpay-processing-text); }
    .error-message.warning { background: var(--icpay-warning-bg); border-color: var(--icpay-warning-border); color: var(--icpay-warning-text); }
    .error-message.error { background: var(--icpay-error-bg); border-color: var(--icpay-error-border); color: var(--icpay-error-text); }
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
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'pay' | null = null;
  @state() private showWalletModal = false;
  @state() private walletModalStep: 'connect' | 'balances' = 'connect';
  @state() private showOnrampModal = false;
  @state() private onrampUrl: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  @state() private oisyReadyToPay: boolean = false;
  @state() private lastWalletId: string | null = null;
  private pnp: any | null = null;
  private transakMessageHandlerBound: any | null = null;
  private onrampPollTimer: number | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;
  // Integrated balances
  @state() private showBalanceModal = false;
  @state() private balancesLoading = false;
  @state() private balancesError: string | null = null;
  @state() private walletBalances: any[] = [];
  private sdk: WidgetSdk | null = null;


  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return;
    debugLog(this.config?.debug || false, 'Amount input connected', { config: this.config });
    this.amountUsd = Number(this.config?.defaultAmountUsd ?? 0);
    this.hasUserAmount = false;
    // No ledger preload; balances flow handles token availability
    // selectedSymbol will be set after balance selection
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Close any wallet/balance modals once an SDK transaction is created
    try {
      window.addEventListener('icpay-sdk-transaction-created', (() => {
        this.showWalletModal = false;
        this.requestUpdate();
      }) as EventListener);
    } catch {}
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config')) {
      // Apply defaults only if user hasn't edited the amount
      if (!this.hasUserAmount && typeof this.config?.defaultAmountUsd === 'number') {
        if (this.amountUsd === 0 || this.amountUsd == null || Number.isNaN(this.amountUsd)) {
          this.amountUsd = Number(this.config.defaultAmountUsd);
        }
      }
      // No ledger preload

      // If we were waiting on wallet connect, resume action
      if (this.pendingAction && this.config?.actorProvider) {
        const action = this.pendingAction;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
        // Do NOT auto-continue if we're already in balances step; wait for user to pick a token
        if (this.walletModalStep !== 'balances') {
          this.pendingAction = null;
          setTimeout(() => { if (action === 'pay') this.pay(); }, 0);
        }
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
      this.pendingAction = 'pay';
      this.showWalletModal = true;
      this.requestUpdate();
      try {
        const amount = Number(this.amountUsd || 0);
        const curr = this.selectedSymbol || 'ICP';
        window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount, currency: curr } }));
      } catch {}
    } catch {}
  };

  // Removed ledger preload

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
        amountUsd: Number(this.amountUsd ?? 0),
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
          const amountUsd = Number(this.amountUsd || 0);
          // Attempt X402 flow first if accepted
          if (sel?.x402Accepts) {
            try {
              await (sdk.client as any).createPaymentX402Usd({
                usdAmount: amountUsd,
                tokenShortcode: (sel as any)?.tokenShortcode,
                metadata: {
                  ...(this.config as any)?.metadata,
                  icpay_network: 'evm',
                  icpay_ledger_id: sel?.ledgerId,
                  icpay_context: 'amount-input:x402'
                },
                recipientAddress: ((((this.config as any)?.recipientAddresses) || {})?.evm) || '0x0000000000000000000000000000000000000000',
                fiat_currency: (this.config as any)?.fiat_currency,
              });
              this.showBalanceModal = false;
              return;
            } catch (e) {
              // fall back to normal flow, but surface error if user should see it
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
              icpay_network: 'evm',
              icpay_ledger_id: sel?.ledgerId
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
    if (action === 'pay') {
      // IC flow: send using tokenShortcode same as EVM
      try {
        const sel = (this.walletBalances || []).find((b: any) => (b as any)?.tokenShortcode === shortcode);
        const sdk = createSdk(this.config);
        const amountUsd = Number(this.amountUsd || 0);
        const chainName = String((sel as any)?.ledgerName || (sel as any)?.chainName || '').toLowerCase();
        const isSol = chainName.includes('sol');
        const isIc = chainName.includes('ic');
        const dest = (this.config as any)?.recipientAddresses || {};
        const chosen = isSol ? (dest.sol || dest.ic) : (dest.ic);
        // If Solana token supports x402, try x402 flow first
        if ((sel as any)?.x402Accepts) {
          try {
            const metadata = {
              ...(this.config as any)?.metadata,
            icpay: {
              ...(((this.config as any)?.metadata || {})?.icpay || {}),
              icpay_network: isSol ? 'sol' : (isIc ? 'ic' : (this.config as any)?.icpay_network),
              icpay_ledger_id: (sel as any)?.ledgerId,
              icpay_context: 'amount-input:x402'
            }
            };
            await (sdk.client as any).createPaymentX402Usd({
              usdAmount: amountUsd,
              tokenShortcode: (sel as any)?.tokenShortcode,
              metadata,
              recipientAddress: (chosen || ''),
              fiat_currency: (this.config as any)?.fiat_currency,
            });
            return;
          } catch (e) {
            // Do not fallback to normal flow for Solana x402; surface error
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
      const amountUsd = Number(this.amountUsd);
      const resp = await (sdk as any).startOnrampUsd(amountUsd, undefined, { context: 'amount-input:onramp', onrampPayment: true, onrampProvider: (this as any)?.selectedOnrampProvider || 'coinbase' });
      const url =
        resp?.metadata?.onramp?.url ||
        resp?.onramp?.url ||
        resp?.metadata?.icpay_onramp?.url ||
        resp?.paymentIntent?.metadata?.icpay?.onrampUrl ||
        resp?.metadata?.icpay?.onrampUrl ||
        null;
      const paymentIntentId = resp?.metadata?.icpay_payment_intent_id || resp?.metadata?.paymentIntentId || resp?.paymentIntentId || null;
      const errorMessage = resp?.metadata?.icpay_onramp?.errorMessage || resp?.metadata?.onramp?.errorMessage || null;
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

  private resetPaymentFlow() {
    resetPaymentFlowUtil(this as PaymentFlowResetContext, { pendingAction: 'pay' });
  }

  private async pay() {
    if (!isBrowser) return;

    this.resetPaymentFlow();

    if (!this.isValidAmount()) {
      this.errorMessage = 'Please enter a valid amount';
      this.errorSeverity = ErrorSeverity.WARNING;
      return;
    }

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount: this.amountUsd, currency: this.selectedSymbol || 'ICP' } })); } catch {}

    this.processing = true;
    try {
      const ready = await this.ensureWallet();
      if (!ready) return;

      this.showWalletModal = true;
      await this.fetchAndShowBalances();
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
    const payLabelRaw = this.config?.buttonLabel || 'Pay ${amount} with crypto';
    const payLabel = payLabelRaw
      .replace('{amount}', this.amountUsd ? `${Number(this.amountUsd).toFixed(2)}` : '$0.00')
      .replace('{symbol}', this.selectedSymbol || 'ICP');
    const selectedLabel = this.selectedSymbol || 'ICP';
    const progressEnabled = this.config?.progressBar?.enabled !== false;
    const showProgressBar = progressEnabled;

    return html`
      <div class="icpay-card icpay-section icpay-widget-base">
        ${showProgressBar ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.amountUsd || 0)}
            .ledgerSymbol=${this.selectedSymbol || 'ICP'}
          ></icpay-progress-bar>
        ` : null}

        <div class="row">
          <div class="top-row">
            <div class="amount-field">
              <span class="currency-prefix">$</span>
              <input type="number" min="0" step="${Number(this.config?.stepUsd ?? 0.5)}" .value=${String(this.amountUsd || '')} placeholder="${placeholder}" @input=${(e: any) => this.onInputChange(e)} />
            </div>
            ${null}
          </div>
          <button class="pay-button ${this.processing?'processing':''}"
            ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
            @click=${() => this.pay()}>
            ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : payLabel)}
          </button>
        </div>
        <div class="hint">Min: $${Number(this.config?.minUsd ?? 0.5).toFixed(2)}${this.config?.maxUsd ? `, Max: $${Number(this.config.maxUsd).toFixed(2)}` : ''}</div>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`<button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">${this.errorAction}</button>` : ''}
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
          balances: this.walletModalStep === 'balances' ? (this.walletBalances as any) : [],
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
              const min = 5; const amt = Number(this.amountUsd || 0); if (amt > 0 && amt < min && ((this.config?.onramp?.enabled === true) && (this.config?.onrampDisabled !== true))) { const d = (min - amt).toFixed(2); return `Note: Minimum card amount is $${min}. You will pay about $${d} more.`; } return null;
            })(),
            oisyReadyToPay: this.oisyReadyToPay,
            onOisyPay: () => { this.showWalletModal = false; this.oisyReadyToPay = false; this.pay(); },
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

declare global { interface HTMLElementTagNameMap { 'icpay-amount-input': ICPayAmountInput } }


