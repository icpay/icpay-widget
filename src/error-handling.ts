import { IcpayError } from '@ic-pay/icpay-sdk';

// Define error codes locally to avoid SSR issues
const ERROR_CODES = {
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  WALLET_USER_CANCELLED: 'WALLET_USER_CANCELLED',
  WALLET_SIGNATURE_REJECTED: 'WALLET_SIGNATURE_REJECTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  LEDGER_NOT_FOUND: 'LEDGER_NOT_FOUND',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

// Widget-specific error handling utilities
export interface WidgetErrorHandler {
  onError: (error: IcpayError) => void;
  onUserCancelled?: () => void;
  onInsufficientBalance?: (error: IcpayError) => void;
  onWalletError?: (error: IcpayError) => void;
  onNetworkError?: (error: IcpayError) => void;
}

// Default error handler that logs errors to console
export const defaultErrorHandler: WidgetErrorHandler = {
  onError: (error: IcpayError) => {
    console.error('[ICPay Widget] Error:', error);
  },
  onUserCancelled: () => {
    console.log('[ICPay Widget] User cancelled the action');
  },
  onInsufficientBalance: (error: IcpayError) => {
    console.warn('[ICPay Widget] Insufficient balance:', error.message);
  },
  onWalletError: (error: IcpayError) => {
    console.warn('[ICPay Widget] Wallet error:', error.message);
  },
  onNetworkError: (error: IcpayError) => {
    console.error('[ICPay Widget] Network error:', error.message);
  }
};

// Error handling function for widget components
export function handleWidgetError(error: unknown, errorHandler: WidgetErrorHandler = defaultErrorHandler): void {
  if (error instanceof IcpayError) {
    // Call the general error handler
    errorHandler.onError(error);

    // Call specific handlers based on error type
    if (error.isUserCancelled()) {
      errorHandler.onUserCancelled?.();
    } else if (error.isBalanceError()) {
      errorHandler.onInsufficientBalance?.(error);
    } else if (error.isWalletError()) {
      errorHandler.onWalletError?.(error);
    } else if (error.isNetworkError()) {
      errorHandler.onNetworkError?.(error);
    }
  } else {
    // Handle non-IcpayError errors
    console.error('[ICPay Widget] Unknown error:', error);
    errorHandler.onError(new IcpayError({
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      details: error
    }));
  }
}

// Error message templates for common scenarios
export const ERROR_MESSAGES = {
  [ERROR_CODES.WALLET_NOT_CONNECTED]: 'Please connect your wallet to continue',
  [ERROR_CODES.WALLET_USER_CANCELLED]: 'User have rejected the transfer',
  [ERROR_CODES.WALLET_SIGNATURE_REJECTED]: 'User have rejected the transfer',
  [ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient balance for this transaction',
  [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please try again',
  [ERROR_CODES.API_ERROR]: 'Service temporarily unavailable',
  [ERROR_CODES.LEDGER_NOT_FOUND]: 'Selected token is not supported',
  [ERROR_CODES.TRANSACTION_FAILED]: 'Transaction failed. Please try again',
  [ERROR_CODES.TRANSACTION_TIMEOUT]: 'Transaction timed out. Please try again',
  [ERROR_CODES.UNKNOWN_ERROR]: 'Something went wrong. Please try again'
} as const;

// Get user-friendly error message
export function getErrorMessage(error: IcpayError): string {
  return ERROR_MESSAGES[error.code] || error.message || 'An error occurred';
}

// Check if error should be shown to user (vs logged only)
export function shouldShowErrorToUser(error: IcpayError): boolean {
  // Don't show user-cancelled actions as errors
  if (error.isUserCancelled()) {
    return false;
  }

  // Show all other errors to user
  return true;
}

// Get appropriate UI action for error
export function getErrorAction(error: IcpayError): string | null {
  // Disable for now
  return null;
  /*
  if (error.userAction) {
    return error.userAction;
  }

  switch (error.code) {
    case ERROR_CODES.WALLET_NOT_CONNECTED:
      return 'Connect Wallet';
    case ERROR_CODES.INSUFFICIENT_BALANCE:
      return 'Add Funds';
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.API_ERROR:
      return 'Try Again';
    default:
      return null;
  }
  */
}

// Error severity levels for UI styling
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

export function getErrorSeverity(error: IcpayError): ErrorSeverity {
  if (error.isUserCancelled()) {
    return ErrorSeverity.INFO;
  }

  if (error.isBalanceError() || error.isWalletError()) {
    return ErrorSeverity.WARNING;
  }

  return ErrorSeverity.ERROR;
}
