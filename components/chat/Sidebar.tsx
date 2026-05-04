'use client';

import { useState } from 'react';
import Logo from '@/components/shared/Logo';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { ConversationSummary } from '@/types/api';

interface Props {
  onNewChat: () => void;
  onLogout: () => void;
  onSelectConversation: (userId: string) => void;
}

export default function Sidebar({ onNewChat, onLogout, onSelectConversation }: Props) {
  const user = useAuthStore((s) => s.user);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const isLoading = useChatStore((s) => s.isLoadingConversations);
  const [showLogout, setShowLogout] = useState(false);

  function formatTime(ts: string | null) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <aside className="w-full md:w-72 lg:w-80 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col h-full">

      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">WhisperBox</h1>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                wsStatus === 'connected' ? 'bg-emerald-400' :
                wsStatus === 'error' ? 'bg-red-400' : 'bg-slate-500'
              }`} aria-hidden="true" />
              <span className="text-xs text-slate-500 capitalize">{wsStatus}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onNewChat}
          aria-label="New conversation"
          className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center p-8">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-label="Loading conversations" />
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center mt-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm font-medium">No conversations yet</p>
            <p className="text-slate-600 text-xs mt-1">Click + to start a new chat</p>
          </div>
        )}

        {conversations.map((conv: ConversationSummary) => {
          const unread = unreadCounts[conv.user_id] || 0;
          return (
            <button
              key={conv.user_id}
              onClick={() => onSelectConversation(conv.user_id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 transition text-left focus-visible:outline-none focus-visible:bg-slate-800 ${
                activeId === conv.user_id ? 'bg-slate-800' : 'hover:bg-slate-900'
              }`}
              aria-current={activeId === conv.user_id ? 'true' : undefined}
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
                  <span className="text-indigo-300 text-sm font-semibold">
                    {conv.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-medium truncate ${unread > 0 ? 'text-white' : 'text-slate-300'}`}>
                    {conv.display_name}
                  </p>
                  <span className="text-slate-500 text-xs flex-shrink-0">{formatTime(conv.last_message_at)}</span>
                </div>
                <p className="text-slate-500 text-xs truncate">@{conv.username}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={() => setShowLogout(!showLogout)}
          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-expanded={showLogout}
        >
          <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-indigo-300 text-xs font-semibold">
              {user?.displayName?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-xs font-medium truncate">{user?.displayName}</p>
            <p className="text-slate-500 text-xs truncate">@{user?.username}</p>
          </div>
        </button>
        {showLogout && (
          <button
            onClick={onLogout}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:bg-red-500/10 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        )}
      </div>

    </aside>
  );
}