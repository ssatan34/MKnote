import { Icon } from "./Icon";
import { CopyFeedbackIcon } from "./CopyFeedbackIcon";
import logoUrl from "../assets/icons/logo.svg";

/** 顶栏 Logo / 浮标 */
export function IconLogoPlaceholder() {
  return (
    <span className="mk-icon" aria-hidden>
      <img src={logoUrl} width="24" height="24" alt="MKnote" />
    </span>
  );
}

/** 未置顶：开锁 */
export function IconLockOpen() {
  return <Icon name="lock_open" size={16} />;
}

/** 已置顶：关锁 */
export function IconLockClosed() {
  return <Icon name="lock_closed" size={16} />;
}

/** Inbox 区标识 */
export function IconStar() {
  return <Icon name="zone_inbox" size={16} />;
}

/** Default 区标识 */
export function IconSquare() {
  return <Icon name="zone_default" size={16} />;
}

export function IconFolder() {
  return <Icon name="pick_folder" size={16} />;
}

export function IconSidebar() {
  return <Icon name="library" size={16} />;
}

export function IconSync() {
  return <Icon name="sync" size={16} />;
}

export function IconPalette() {
  return <Icon name="appearance" size={16} />;
}

export function IconSun() {
  return <Icon name="theme_light" size={16} />;
}

export function IconMoon() {
  return <Icon name="theme_dark" size={16} />;
}

export function IconComputer() {
  return <Icon name="theme_system" size={16} />;
}

export function IconCopy() {
  return <CopyFeedbackIcon size={14} />;
}

export function IconCodeExpand() {
  return <Icon name="code_expand" size={14} />;
}

export function IconCodeCollapse() {
  return <Icon name="code_collapse" size={14} />;
}

export function ThemeIcon({ theme }: { theme: string }) {
  if (theme === "dark") return <Icon name="theme_dark" size={16} />;
  if (theme === "system") return <Icon name="theme_system" size={16} />;
  return <Icon name="theme_light" size={16} />;
}
