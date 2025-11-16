import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { CoffeeShopConfig } from '../types';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import './ui/progress-bar';
import { renderWalletSelectorModal } from './ui/wallet-selector-modal';
import { renderTransakOnrampModal, TransakOnrampOptions } from './ui/transak-onramp-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet, detectOisySessionViaAdapter } from '../utils/pnp';
import { buildWalletEntries, getWalletBalanceEntries, isEvmWalletId, ensureEvmChain } from '../utils/balances';
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
  @state() private selectedSymbol: string | null = null;
  @state() private processing = false;
  // Ledger options removed; token selection comes from balances modal
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'order' | null = null;
  @state() private showWalletModal = false;
  @state() private oisyReadyToPay: boolean = false;
  @state() private lastWalletId: string | null = null;
  private pnp: any | null = null;
  @state() private showOnrampModal = false;
  @state() private onrampSessionId: string | null = null;
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

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Coffee shop connected', { config: this.config });

    if (this.config && typeof this.config.defaultItemIndex === 'number') this.selectedIndex = this.config.defaultItemIndex;
    // No ledger preload; balances flow handles token availability
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Close wallet/balance modals once SDK transaction is created
    try {
      window.addEventListener('icpay-sdk-transaction-created', (() => {
        this.showWalletModal = false;
        this.requestUpdate();
      }) as EventListener);
    } catch {}
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      setTimeout(() => { if (action === 'order') this.order(); }, 0);
    }
  }

  private onSwitchAccount = async (e: any) => {
    try {
      if (this.pnp) {
        try { await this.pnp.disconnect(); } catch {}
      }
      this.walletConnected = false;
      this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
      this.pendingAction = 'order';
      this.showWalletModal = true;
      this.requestUpdate();
      try {
        const amount = Number(this.selectedItem?.priceUsd || 0);
        const curr = this.selectedSymbol || 'ICP';
        window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'order', type: 'sendUsd', amount, currency: curr } }));
      } catch {}
    } catch {}
  };

  // Removed ledger preload

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

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'order', type: 'sendUsd', amount: this.selectedItem.priceUsd, currency: this.selectedSymbol || 'ICP' } })); } catch {}

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
            if (!WalletSelect) { const module = await import('../wallet-select'); WalletSelect = module.WalletSelect; }
            const wantsOisyTab = !!((this.config as any)?.openOisyInNewTab || (this.config as any)?.plugNPlay?.openOisyInNewTab);
            const _cfg: any = wantsOisyTab ? applyOisyNewTabConfig({ ...(this.config?.plugNPlay || {}) }) : ({ ...(this.config?.plugNPlay || {}) });
            if ((this.config as any)?.chainTypes) _cfg.chainTypes = (this.config as any).chainTypes;
            try {
              if (typeof window !== 'undefined') {
                const { resolveDerivationOrigin } = await import('../utils/origin');
                _cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
              }
            } catch {}
            this.pnp = new WalletSelect(_cfg);
            try {
              const principal = await detectOisySessionViaAdapter(this.pnp);
              if (principal) {
                this.walletConnected = true;
                const normalized = normalizeConnectedWallet(this.pnp, { owner: principal, principal, connected: true });
                const evmProvider = (this.pnp as any)?.getEvmProvider?.();
                this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}) } as any;
                this.sdk = null;
                try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'oisy' } })); } catch {}
                this.order();
                return;
              }
            } catch {}
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

      const symbol = this.selectedSymbol || 'ICP';

      debugLog(this.config?.debug || false, 'Coffee order payment details', {
        item: this.selectedItem.name,
        priceUsd: this.selectedItem.priceUsd,
        selectedSymbol: symbol
      });

      // Do not pre-open Oisy signer tab here; let SDK handle it inside this click
      const resp = await sdk.sendUsd(this.selectedItem.priceUsd, symbol, { context: 'coffee', item: this.selectedItem.name });
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
      const symbol = this.selectedSymbol || 'ICP';
      const resp = await (sdk as any).startOnrampUsd(this.selectedItem.priceUsd, symbol, { context: 'coffee:onramp', item: this.selectedItem.name });
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
        this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}) } as any;
        this.sdk = null;
        const isOisy = this.lastWalletId === 'oisy';
        if (isOisy) {
          this.oisyReadyToPay = true;
        } else {
          this.showWalletModal = false;
          // Open token-balance picker after any successful wallet connect
          this.fetchAndShowBalances();
        }
      }).catch((error: any) => {
        this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
        this.errorSeverity = ErrorSeverity.ERROR;
        this.showWalletModal = false;
      });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  private async fetchAndShowBalances() {
    try {
      this.balancesLoading = true;
      this.balancesError = null;
      this.showBalanceModal = true;
      const sdk = createSdk(this.config);
      const { balances } = await getWalletBalanceEntries({
        sdk,
        lastWalletId: this.lastWalletId,
        connectedWallet: (this.config as any)?.connectedWallet,
        amountUsd: Number(this.selectedItem?.priceUsd ?? 0),
        chainShortcodes: (this.config as any)?.chainShortcodes,
        ledgerShortcodes: (this.config as any)?.ledgerShortcodes,
      });
      this.walletBalances = balances as any[];
    } catch (e: any) {
      this.walletBalances = [];
      this.balancesError = (e && (e.message || String(e))) || 'Failed to load balances';
    } finally {
      this.balancesLoading = false;
    }
  }

  private onSelectBalanceSymbol = (symbol: string) => {
    if (symbol && typeof symbol === 'string') {
      this.selectedSymbol = symbol;
    }
    if (isEvmWalletId(this.lastWalletId)) {
      const sel = (this.walletBalances || []).find((b: any) => b.ledgerSymbol === (this.selectedSymbol || symbol));
      const targetChain = sel?.chainId;
      ensureEvmChain(targetChain, { chainName: sel?.chainName, rpcUrlPublic: (sel as any)?.rpcUrlPublic, nativeSymbol: sel?.ledgerSymbol, decimals: sel?.decimals }).then(async () => {
        try {
          const sdk = createSdk(this.config);
          const amountUsd = Number(this.selectedItem?.priceUsd || 0);
          if (sel?.x402Accepts) {
            try {
              await (sdk.client as any).createPaymentX402Usd({
                usdAmount: amountUsd,
                symbol: sel?.ledgerSymbol,
                metadata: { network: 'evm', ledgerId: sel?.ledgerId, chainId: sel?.chainUuid, context: 'coffee:x402', item: this.selectedItem?.name }
              });
              this.showBalanceModal = false;
              return;
            } catch {}
          }
          await (sdk.client as any).createPaymentUsd({
            usdAmount: amountUsd,
            chainId: sel?.chainUuid,
            symbol: sel?.ledgerSymbol,
            metadata: { network: 'evm', ledgerId: sel?.ledgerId, item: this.selectedItem?.name }
          });
        } catch {}
        this.showBalanceModal = false;
      });
      return;
    }
    this.showBalanceModal = false;
    const action = this.pendingAction; this.pendingAction = null;
    if (action === 'order') setTimeout(() => this.order(), 0);
  };

  render() {
    if (!this.config) {
      return html`<div class="icpay-card icpay-section">Loading...</div>`;
    }

    return html`
      <div class="icpay-card icpay-section icpay-widget-base">
        ${this.config?.progressBar?.enabled !== false ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.selectedItem?.priceUsd || 0)}
            .ledgerSymbol=${this.selectedSymbol || 'ICP'}
          ></icpay-progress-bar>
        ` : null}
        <div class="menu">
          ${this.config.items.map((it, i) => html`
            <div class="item ${this.selectedIndex===i?'selected':''}" @click=${() => this.selectItem(i)}>
              <span>${it.name}</span>
              <span>$${Number(it?.priceUsd ?? 0).toFixed(2)}</span>
            </div>
          `)}
        </div>

        <div class="total">Order Total: $${Number(this.selectedItem?.priceUsd ?? 0).toFixed(2)}</div>



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
          const walletsRaw = (this as any).pnp?.getEnabledWallets?.() || [];
          const wallets = (buildWalletEntries as any)(walletsRaw);
          return renderWalletSelectorModal({
            visible: !!(this.showWalletModal && this.pnp),
            wallets,
            isConnecting: false,
            onSwitchAccount: () => this.onSwitchAccount(null),
            onSelect: (walletId: string) => this.connectWithWallet(walletId),
            onClose: () => { this.showWalletModal = false; this.oisyReadyToPay = false; },
            onCreditCard: ((this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true)) ? () => this.startOnramp() : undefined,
            creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
            showCreditCard: (this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true),
            creditCardTooltip: (() => {
              const min = 5; const i = this.config?.defaultItemIndex ?? 0; const amt = Number((this.config?.items?.[i]?.priceUsd) || 0); if (amt > 0 && amt < min && ((this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true))) { const d = (min - amt).toFixed(2); return `Note: Minimum card amount is $${min}. You will pay about $${d} more.`; } return null;
            })(),
            oisyReadyToPay: this.oisyReadyToPay,
            onOisyPay: () => { this.showWalletModal = false; this.oisyReadyToPay = false; this.order(); }
          });
        })()}

        ${renderWalletBalanceModal({
          visible: this.showBalanceModal,
          isLoading: this.balancesLoading,
          error: this.balancesError,
          balances: this.walletBalances as any,
          onSelect: (s: string) => this.onSelectBalanceSymbol(s),
          onClose: () => { this.showBalanceModal = false; },
        })}

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

declare global { interface HTMLElementTagNameMap { 'icpay-coffee-shop': ICPayCoffeeShop } }


