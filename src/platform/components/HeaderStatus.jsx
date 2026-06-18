import { p2pStatusClassName, resolveHeaderStatus } from '../p2pStatus.js';

export function HeaderStatus({ p2pStatus, signalingStatus, room, isHost, hideWhenOk = false }) {
  if (!room) return null;

  const status = resolveHeaderStatus({
    signalingStatus,
    p2pStatus,
    room,
    isHost,
    hideWhenOk,
  });

  if (!status) return null;

  return (
    <div
      className={p2pStatusClassName(status.level)}
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
