export type ThemeConfig = {
  mode?: 'light' | 'dark'; // Light or dark mode (default: 'dark')
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  surfaceColor?: string;
  surfaceAltColor?: string;
  borderColor?: string;
  fontFamily?: string;
};

export type PlugNPlayConfig = {
  enabled?: boolean; // Whether to enable Plug N Play (default: true)
  providers?: {
    internetIdentity?: boolean; // Enable/disable Internet Identity (default: true)
    oisy?: boolean; // Enable/disable OISY (default: true)
    plug?: boolean; // Enable/disable Plug (default: true)
  };
  theme?: {
    modalBackground?: string;
    modalBorderRadius?: string;
    buttonBackground?: string;
    buttonHoverBackground?: string;
    textColor?: string;
    primaryColor?: string;
  };
};

export type ProgressBarConfig = {
  enabled?: boolean; // default: true
};

export type CommonConfig = {
  publishableKey: string; // from icpay-sdk
  apiUrl?: string;
  icHost?: string;
  // If provided, SDK will use this EVM provider for all EVM requests/signatures
  evmProvider?: any;
  // Optional: platform-retained extra cost in smallest unit; forwarded to intent metadata
  externalCostAmount?: string | number;
  // Optional: per-chain recipient addresses for relay. Keys: evm/ic/sol.
  // If provided, widget filters wallets to those chain types and forwards the matching address to the SDK.
  recipientAddresses?: {
    evm?: string;
    ic?: string;
    sol?: string;
  };
  // Optional: EVM recipient address for relay; always forwarded to SDK requests (defaults to 0x0)
  recipientAddress?: string;
  // Optional: human-readable description passed to payment_intent.description
  // If not provided, defaults to a generic label on submit.
  description?: string;
  // Chain/network selection (for multi-chain assets)
  chainName?: string; // default: 'IC'
  chainId?: number;   // default: 0
  // Optional filtering for wallet balance checker
  chainShortcodes?: string[];   // e.g., ['base','ic']
  tokenShortcodes?: string[];  // e.g., ['icp','pay']
  // Optional wallet selection filter: which chain types to show wallets for
  chainTypes?: Array<'ic' | 'evm' | 'sol'>;
  // Optional: fiat currency for display (id or code, e.g. USD, EUR). Defaults to USD if missing.
  fiat_currency?: string;
  // Optional metadata to include on created payment intents
  metadata?: Record<string, any>;
  // Optional derivation origin override used by wallet connectors like Internet Identity
  derivationOrigin?: string;
  actorProvider?: (canisterId: string, idl: any) => any;
  connectedWallet?: any;
  useOwnWallet?: boolean; // If true, widget will not handle wallet connection
  plugNPlay?: PlugNPlayConfig; // Configuration for built-in Plug N Play
  // Theme: can be a simple string ('light' | 'dark') or a ThemeConfig object for advanced customization
  theme?: 'light' | 'dark' | ThemeConfig;
  debug?: boolean; // Enable debug logging for both widget and SDK
  progressBar?: ProgressBarConfig; // Progress bar settings
  // If true, disable the payment button manually
  disablePaymentButton?: boolean;
  // If true, disable the payment button after a successful payment
  disableAfterSuccess?: boolean;
  // Temporary kill switch: disable card onramp across all components
  onrampDisabled?: boolean;
  // Optional onramp (Transak) configuration
  onramp?: OnrampConfig;
  /**
   * Optional: existing payment intent id (e.g. from server/checkout).
   * When set, widget loads the intent from icpay-api; if already completed, shows success.
   * Otherwise amount/currency and payment flow are driven by the loaded intent.
   */
  paymentIntentId?: string;
};


export type PremiumContentConfig = CommonConfig & {
  priceUsd: number;
  imageUrl?: string;
  // Optional: customize button label with template variables {amount} and {symbol}
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string }) => void;
};

export type TipJarConfig = CommonConfig & {
  amountsUsd?: number[];
  defaultAmountUsd?: number;
  // Optional: customize button label with template variables {amount} and {symbol}
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string; total?: number }) => void;
};

export type ArticlePaywallConfig = CommonConfig & {
  priceUsd: number;
  title?: string;
  preview?: string;
  lockedContent?: string;
  // Optional: customize button label with template variables
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string }) => void;
};

export type CoffeeShopConfig = CommonConfig & {
  items: Array<{ name: string; priceUsd: number }>;
  defaultItemIndex?: number;
  // Optional: customize button label with template variables
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string; item: string }) => void;
};

export type DonationThermometerConfig = CommonConfig & {
  goalUsd: number;
  defaultAmountUsd?: number;
  amountsUsd?: number[];
  // Optional: customize button label with template variables
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string; raised: number }) => void;
};


// Onramp (Transak) configuration subset to drive the Transak modal
export type OnrampConfig = {
  environment?: 'STAGING' | 'PRODUCTION';
  apiKey?: string | null; // Transak public API key (for double iframe fallback)
  width?: number | string;
  height?: number | string;
  // If true, automatically open Transak modal when onramp starts
  autoOpen?: boolean;
  // Optional label override for the wallet modal CTA
  creditCardLabel?: string;
  // Enable/disable onramp (credit card) option in wallet selector (default: disabled)
  enabled?: boolean;
  // Optional list of onramp providers (if omitted, fallback to transak if enabled)
  providers?: Array<{
    slug: string; // 'transak' | 'coinbase' | others
    name?: string;
    enabled?: boolean;
    logoUrl?: string;
    default?: boolean;
  }>;
};


// Simple pay button: fixed USD amount (or label-only), optional ledger dropdown
export type PayButtonConfig = CommonConfig & {
  // If set, shows amount on the button like "Pay $12 with ICPay"; otherwise a generic label
  amountUsd?: number;
  // Optional: override button label when amountUsd is not provided
  buttonLabel?: string;
  // Called on successful payment
  onSuccess?: (tx: { id: number; status: string }) => void;
};

// Amount input with inline pay button: enter USD amount, optional ledger dropdown
export type AmountInputConfig = CommonConfig & {
  // Placeholder and defaults
  placeholder?: string; // default: "Enter amount in USD"
  defaultAmountUsd?: number; // e.g., 45
  // Validation
  minUsd?: number; // default: 0.5
  maxUsd?: number; // optional cap
  stepUsd?: number; // default: 0.5
  // Labels
  buttonLabel?: string; // default: "Pay with ICPay"
  // Callbacks
  onSuccess?: (tx: { id: number; status: string; amountUsd: number }) => void;
};

