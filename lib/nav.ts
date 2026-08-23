import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Coins, TrendingUp, TrendingDown, Flame, LineChart,
  Percent, Layers, Droplets, Grid3x3, Fish, Newspaper, Star, Wallet, Bell, Activity,
  Waves, Network, Boxes, Radar, Gauge,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    // Intelligence leads: the product's claim is about flow and evidence, and
    // the navigation should say so before price does.
    title: 'Intelligence',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Money Flow', href: '/money-flow', icon: Waves },
      { label: 'Breadth', href: '/breadth', icon: Radar },
      { label: 'Liquidity', href: '/liquidity', icon: Gauge },
      { label: 'Whales', href: '/whales', icon: Fish },
      { label: 'On-chain', href: '/onchain', icon: Network },
      { label: 'Sectors', href: '/sectors', icon: Boxes },
      { label: 'Alerts', href: '/alerts', icon: Bell },
    ],
  },
  {
    title: 'Market',
    items: [
      { label: 'Coins', href: '/coins', icon: Coins },
      { label: 'Gainers', href: '/coins?tab=gainers', icon: TrendingUp },
      { label: 'Losers', href: '/coins?tab=losers', icon: TrendingDown },
      { label: 'Heatmap', href: '/heatmap', icon: Grid3x3 },
    ],
  },
  {
    title: 'Derivatives',
    items: [
      { label: 'Futures', href: '/futures', icon: LineChart },
      { label: 'Funding', href: '/funding', icon: Percent },
      { label: 'Open Interest', href: '/open-interest', icon: Layers },
      { label: 'Long / Short', href: '/long-short', icon: Flame },
      { label: 'Liquidations', href: '/liquidations', icon: Droplets },
      { label: 'Liq. Heatmap', href: '/liquidations/heatmap', icon: Grid3x3 },
      { label: 'Liq. Map', href: '/liquidations/map', icon: Layers },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Watchlist', href: '/watchlist', icon: Star },
      { label: 'Portfolio', href: '/portfolio', icon: Wallet },
      { label: 'Price alerts', href: '/price-alerts', icon: Bell },
      { label: 'Whale trades', href: '/whale', icon: Fish },
      { label: 'News', href: '/news', icon: Newspaper },
      { label: 'API Status', href: '/status', icon: Activity },
    ],
  },
];

/** Bottom-nav (mobile) — the 5 most-used destinations. */
export const BOTTOM_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: LayoutDashboard },
  { label: 'Flow', href: '/money-flow', icon: Waves },
  { label: 'Breadth', href: '/breadth', icon: Radar },
  { label: 'Market', href: '/coins', icon: Coins },
  { label: 'Watchlist', href: '/watchlist', icon: Star },
];
