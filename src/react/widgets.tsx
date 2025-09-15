import { createWebComponent } from './createWrapper';
import type {
  PayButtonConfig,
  AmountInputConfig,
  PremiumContentConfig,
  TipJarConfig,
  ArticlePaywallConfig,
  CoffeeShopConfig,
  DonationThermometerConfig,
  ThemeConfig
} from '../types';

// Public React components
export const IcpayPayButton = createWebComponent<HTMLElement, { config?: PayButtonConfig }>('icpay-pay-button');
export const IcpayAmountInput = createWebComponent<HTMLElement, { config?: AmountInputConfig }>('icpay-amount-input');
export const IcpayPremiumContent = createWebComponent<HTMLElement, { config?: PremiumContentConfig }>('icpay-premium-content');
export const IcpayTipJar = createWebComponent<HTMLElement, { config?: TipJarConfig }>('icpay-tip-jar');
export const IcpayArticlePaywall = createWebComponent<HTMLElement, { config?: ArticlePaywallConfig }>('icpay-article-paywall');
export const IcpayCoffeeShop = createWebComponent<HTMLElement, { config?: CoffeeShopConfig }>('icpay-coffee-shop');
export const IcpayDonationThermometer = createWebComponent<HTMLElement, { config?: DonationThermometerConfig }>('icpay-donation-thermometer');
export const IcpayProgressBar = createWebComponent<HTMLElement, {
  open?: boolean;
  steps?: Array<{ key: string; label: string; tooltip: string; status: string }>;
  amount?: number;
  currency?: string;
  ledgerSymbol?: string;
  debug?: boolean;
  theme?: ThemeConfig;
}>('icpay-progress-bar');

// Internal helpers (not exported): wallet selector is not a standalone element.


