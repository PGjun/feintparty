import { useEffect, useRef, useState } from 'react';
import { getPlayerColor } from '../constants.js';

export function ChatPanel({ messages, players, onSend, disabled, placeholder }) {
  const [text, setText] = useState('');
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const lastScrollKey = useRef('');

  const scrollKey =
    messages.length > 0
      ? `${messages.length}-${messages[messages.length - 1].time}`
      : '0';

  useEffect(() => {
    if (scrollKey === lastScrollKey.current) return;
    lastScrollKey.current = scrollKey;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="chat-box">
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.type}`}>
            {msg.type === 'system' ? (
              msg.text
            ) : msg.type === 'correct' ? (
              <>
                🎉{' '}
                <span className="name" style={{ color: getPlayerColor(players, msg.name) }}>
                  {msg.name}
                </span>
                : {msg.text} — 정답!
              </>
            ) : (
              <>
                <span className="name" style={{ color: getPlayerColor(players, msg.name) }}>
                  {msg.name}:
                </span>
                {msg.text}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          ref={inputRef}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={disabled}
          readOnly={disabled}
          tabIndex={disabled ? -1 : 0}
          inputMode={disabled ? 'none' : 'text'}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={disabled || !text.trim()}
        >
          전송
        </button>
      </div>
    </div>
  );
}
