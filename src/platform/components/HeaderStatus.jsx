import { resolveHeaderStatus, statusClassName } from '../headerStatus.js';

export function HeaderStatus({ signalingStatus, room, isHost, hideWhenOk = false }) {
  if (!room) return null;

  const status = resolveHeaderStatus({
    signalingStatus,
    room,
    isHost,
    hideWhenOk,
  });

  if (!status) return null;

  return (
    <div
      className={statusClassName(status.level)}
      role="status"
      aria-live="polite"
      title={status.text}
    >
      {status.useDot ? (
        <span className="header-status-dot" aria-hidden="true" />
      ) : status.icon ? (
        <span className="header-status-icon" aria-hidden="true">
          {status.icon}
        </span>
      ) : null}
      <span className="header-status-text">{status.text}</span>
    </div>
  );
}
