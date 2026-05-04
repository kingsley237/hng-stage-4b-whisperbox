'use client';

import { useState, useEffect, useRef } from 'react';
import Spinner from '@/components/shared/Spinner';
import { searchUsers } from '@/lib/api';
import { UserPublicInfo } from '@/types/api';

interface Props {
  onSelect: (user: UserPublicInfo) => void;
  onClose: () => void;
}

export default function UserSearch({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserPublicInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await searchUsers(query.trim());
        setResults(res);
      } catch {
        setError('Search failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }, 350);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Search users"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">

        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2.5">
              {isLoading ? (
                <Spinner size={16} className="text-slate-400 flex-shrink-0" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by username or name..."
                className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
                aria-label="Search users"
              />
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Close search"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {error && (
            <div className="p-4 text-red-400 text-sm text-center">{error}</div>
          )}
          {!error && results.length === 0 && query.trim() && !isLoading && (
            <div className="p-8 text-slate-500 text-sm text-center">
              No users found for &quot;{query}&quot;
            </div>
          )}
          {!query.trim() && (
            <div className="p-8 text-slate-500 text-sm text-center">
              Search for someone to message
            </div>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition text-left focus-visible:outline-none focus-visible:bg-slate-800"
            >
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-300 text-sm font-semibold">
                  {user.display_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{user.display_name}</p>
                <p className="text-slate-400 text-xs truncate">@{user.username}</p>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}