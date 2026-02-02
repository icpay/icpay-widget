/**
 * Shared payment flow reset for all widgets.
 * Dispatches icpay-payment-reset, clears widget state, stops onramp polling, and disconnects wallet
 * so every create-payment button press starts from scratch (connect wallet, select token, etc.).
 */

export type PaymentFlowPendingAction = 'pay' | 'unlock' | 'order' | 'donate' | 'tip';

/** Context passed by widgets (this). Use unknown so widgets with private members are accepted. */
export type PaymentFlowResetContext = unknown;

/**
 * Dispatches the global icpay-payment-reset event (progress bar listens and resets).
 */
export function dispatchPaymentReset(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('icpay-payment-reset'));
    }
  } catch {}
}

/**
 * Stops onramp polling and clears controller/timer on the context.
 */
export function stopOnrampPolling(ctx: PaymentFlowResetContext): void {
  const c = ctx as Record<string, unknown>;
  if (!c || typeof c !== 'object') return;
  const controller = c.onrampNotifyController as { stop: () => void } | null | undefined;
  if (controller) {
    try {
      controller.stop();
    } catch {}
    c.onrampNotifyController = null;
  }
  const timer = c.onrampPollTimer as number | null | undefined;
  if (timer != null) {
    try {
      clearTimeout(timer);
    } catch {}
    c.onrampPollTimer = null;
  }
  if ('onrampPollingActive' in c) c.onrampPollingActive = false;
}

/**
 * Disconnects wallet and clears actorProvider/connectedWallet from config when not useOwnWallet.
 */
export function disconnectWalletForReset(ctx: PaymentFlowResetContext): void {
  const c = ctx as Record<string, unknown>;
  if (!c || typeof c !== 'object') return;
  const config = c.config as { useOwnWallet?: boolean; [key: string]: unknown } | undefined;
  const pnp = c.pnp as { disconnect?: () => void | Promise<void> } | null | undefined;
  if (config?.useOwnWallet || !pnp || !config) return;
  try {
    pnp.disconnect?.();
  } catch {}
  c.config = { ...config, actorProvider: undefined, connectedWallet: undefined };
}

/**
 * Resets all common payment flow state on the widget context and performs disconnect + onramp cleanup.
 * Call this at the start of every create-payment action (pay, unlock, order, donate, tip).
 * When keepWalletConnected is true (e.g. user already connected via pre-generated WalletConnect QR),
 * wallet state is preserved and disconnect is skipped so Pay goes straight to token selection.
 */
export function resetPaymentFlow(
  ctx: PaymentFlowResetContext,
  options: { pendingAction: PaymentFlowPendingAction; keepWalletConnected?: boolean }
): void {
  const c = (ctx as Record<string, unknown>) ?? {};
  if (typeof c !== 'object') return;
  const keepWallet = !!options.keepWalletConnected;
  dispatchPaymentReset();

  c.errorMessage = null;
  c.errorSeverity = null;
  c.errorAction = null;
  c.processing = false;
  c.showBalanceModal = false;
  c.selectedSymbol = null;
  c.pendingAction = options.pendingAction;
  c.oisyReadyToPay = false;
  c.showOnrampModal = false;
  c.onrampUrl = null;
  c.onrampPaymentIntentId = null;
  c.onrampErrorMessage = null;

  if (!keepWallet) {
    c.showWalletModal = true;
    c.walletModalStep = 'connect';
    c.lastWalletId = null;
    c.walletConnected = false;
  }

  if ('succeeded' in c) c.succeeded = false;
  if ('skipDisconnectOnce' in c) c.skipDisconnectOnce = false;
  if ('oisySignerPreopened' in c) c.oisySignerPreopened = false;
  if ('showProviderPicker' in c) c.showProviderPicker = false;
  if ('selectedOnrampProvider' in c) c.selectedOnrampProvider = null;

  stopOnrampPolling(ctx);
  if (!keepWallet) disconnectWalletForReset(ctx);

  const req = (ctx as Record<string, unknown>).requestUpdate;
  if (typeof req === 'function') req.call(ctx);
}
