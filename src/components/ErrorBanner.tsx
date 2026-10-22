import { Icon } from "./Icon";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-text">{message}</span>
      <button
        type="button"
        className="error-dismiss"
        aria-label="关闭提示"
        onClick={onDismiss}
      >
        <Icon name="dismiss" size={16} />
      </button>
    </div>
  );
}
