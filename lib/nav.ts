import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Coins, TrendingUp, TrendingDown, Flame, LineChart,
  Percent, Layers, Droplets, Grid3x3, Fish, Newspaper, Star, Wallet, Bell, Activity,
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
    title: 'Market',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
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
      { label: 'Alerts', href: '/alerts', icon: Bell },
      { label: 'Whale', href: '/whale', icon: Fish },
      { label: 'News', href: '/news', icon: Newspaper },
      { label: 'API Status', href: '/status', icon: Activity },
    ],
  },
];

/** Bottom-nav (mobile) — the 5 most-used destinations. */
export const BOTTOM_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: LayoutDashboard },
  { label: 'Market', href: '/coins', icon: Coins },
  { label: 'Futures', href: '/futures', icon: LineChart },
  { label: 'Liquidations', href: '/liquidations', icon: Droplets },
  { label: 'Watchlist', href: '/watchlist', icon: Star },
];
