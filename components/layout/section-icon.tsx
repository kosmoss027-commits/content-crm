import {
  CalendarIcon,
  ChartColumnIcon,
  CheckSquareIcon,
  FlameIcon,
  InboxIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  MapIcon,
  RadarIcon,
  ScrollTextIcon,
  SettingsIcon,
  SunIcon,
  TelescopeIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon, MagnetIcon, NetworkIcon, WalletIcon } from "lucide-react";
import type { IconName } from "@/lib/navigation";

const ICONS: Record<IconName, LucideIcon> = {
  sun: SunIcon,
  telescope: TelescopeIcon,
  radar: RadarIcon,
  scroll: ScrollTextIcon,
  map: MapIcon,
  "layout-dashboard": LayoutDashboardIcon,
  calendar: CalendarIcon,
  chart: ChartColumnIcon,
  key: KeyRoundIcon,
  inbox: InboxIcon,
  users: UsersIcon,
  flame: FlameIcon,
  "check-square": CheckSquareIcon,
  "user-cog": UserCogIcon,
  settings: SettingsIcon,
  magnet: MagnetIcon,
  wallet: WalletIcon,
  network: NetworkIcon,
};

export function SectionIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
