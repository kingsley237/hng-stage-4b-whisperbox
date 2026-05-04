'use client';

import { useState, useRef } from 'react';
import Spinner from '@/components/shared/Spinner';

interface Props {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(trimmed);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  const canSend = text.trim().length > 0 && !isSending && !disabled;

  return (
    <div className="p-4 border-t border-slate-800 bg-slate-950">
      <div className="flex items-end gap-3 bg-slate-800 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 transition">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          placeholder="Message — end-to-end encrypted"
          rows={1}
          aria-label="Message input"
          className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm resize-none focus:outline-none min-h-[22px] max-h-[140px] leading-relaxed disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {isSending ? (
            <Spinner size={14} className="text-white" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs text-slate-600 text-center mt-2">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}