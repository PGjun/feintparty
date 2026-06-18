export function Toast({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="toast" role="alert" aria-live="assertive">
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="닫기">
        ×
      </button>
    </div>
  );
}
