export type ThemeConfig = {
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
  mode?: 'modal' | 'horizontal' | 'vertical' | 'inline'; // default: 'modal'
};

export type CommonConfig = {
  publishableKey: string; // from icpay-sdk
  apiUrl?: string;
  icHost?: string;
  // Optional metadata to include on created payment intents
  metadata?: Record<string, any>;
  // Optional derivation origin override used by wallet connectors like Internet Identity
  derivationOrigin?: string;
  actorProvider?: (canisterId: string, idl: any) => any;
  connectedWallet?: any;
  useOwnWallet?: boolean; // If true, widget will not handle wallet connection
  plugNPlay?: PlugNPlayConfig; // Configuration for built-in Plug N Play
  theme?: ThemeConfig;
  debug?: boolean; // Enable debug logging for both widget and SDK
  progressBar?: ProgressBarConfig; // Progress bar settings
  // If true, disable the payment button manually
  disablePaymentButton?: boolean;
  // If true, disable the payment button after a successful payment
  disableAfterSuccess?: boolean;
  // Global control for token selector rendering: 'buttons' | 'dropdown' | 'none'
  showLedgerDropdown?: 'buttons' | 'dropdown' | 'none';
  // Temporary kill switch: disable card onramp across all components
  onrampDisabled?: boolean;
  // Optional onramp (Transak) configuration
  onramp?: OnrampConfig;
};

export type CryptoOption = {
  symbol: string; // e.g., 'btc', 'eth', 'usdc'
  label: string;  // e.g., 'Bitcoin'
  canisterId?: string; // optional mapping
};

export type PremiumContentConfig = CommonConfig & {
  priceUsd: number;
  cryptoOptions?: CryptoOption[];
  imageUrl?: string;
  // Optional: customize button label with template variables {amount} and {symbol}
  buttonLabel?: string;
  // Optional: default selected symbol
  defaultSymbol?: string;
  onSuccess?: (tx: { id: number; status: string }) => void;
};

export type TipJarConfig = CommonConfig & {
  amountsUsd?: number[];
  defaultAmountUsd?: number;
  cryptoOptions?: CryptoOption[];
  // Optional: default selected symbol (e.g., 'ICP')
  defaultSymbol?: string;
  // Optional: render a ledger selector; if only one option, it will be auto-selected
  showLedgerDropdown?: string;
  // Optional: customize button label with template variables {amount} and {symbol}
  buttonLabel?: string;
  onSuccess?: (tx: { id: number; status: string; total?: number }) => void;
};

export type ArticlePaywallConfig = CommonConfig & {
  priceUsd: number;
  cryptoOptions?: CryptoOption[];
  title?: string;
  preview?: string;
  lockedContent?: string;
  // Optional: customize button label with template variables
  buttonLabel?: string;
  // Optional: default selected symbol
  defaultSymbol?: string;
  onSuccess?: (tx: { id: number; status: string }) => void;
};

export type CoffeeShopConfig = CommonConfig & {
  items: Array<{ name: string; priceUsd: number }>;
  defaultItemIndex?: number;
  cryptoOptions?: CryptoOption[];
  // Optional: customize button label with template variables
  buttonLabel?: string;
  // Optional: default selected symbol
  defaultSymbol?: string;
  onSuccess?: (tx: { id: number; status: string; item: string }) => void;
};

export type DonationThermometerConfig = CommonConfig & {
  goalUsd: number;
  defaultAmountUsd?: number;
  amountsUsd?: number[];
  cryptoOptions?: CryptoOption[];
  // Optional: customize button label with template variables
  buttonLabel?: string;
  // Optional: default selected symbol
  defaultSymbol?: string;
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
  // Enable/disable onramp (Transak) option in wallet selector (default: enabled)
  enabled?: boolean;
};


// Simple pay button: fixed USD amount (or label-only), optional ledger dropdown
export type PayButtonConfig = CommonConfig & {
  // If set, shows amount on the button like "Pay $12 with ICPay"; otherwise a generic label
  amountUsd?: number;
  // Optional: show or override available ledgers; if omitted, use verified ledgers from SDK
  cryptoOptions?: CryptoOption[];
  // Optional: controls whether to render a ledger dropdown; default: false
  showLedgerDropdown?: string;
  // Optional: default selected symbol, e.g. 'ICP'
  defaultSymbol?: string;
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
  // Ledgers
  cryptoOptions?: CryptoOption[];
  // Optional: controls whether to render a ledger dropdown; default: false
  showLedgerDropdown?: string;
  defaultSymbol?: string; // e.g., 'ICP'
  // Validation
  minUsd?: number; // default: 0.5
  maxUsd?: number; // optional cap
  stepUsd?: number; // default: 0.5
  // Labels
  buttonLabel?: string; // default: "Pay with ICPay"
  // Callbacks
  onSuccess?: (tx: { id: number; status: string; amountUsd: number }) => void;
};

