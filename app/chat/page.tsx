'use client';
import { getMessages } from '@/lib/api';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/chat/Sidebar';
import ConversationView from '@/components/chat/ConversationView';
import UserSearch from '@/components/chat/UserSearch';
import Spinner from '@/components/shared/Spinner';
import Logo from '@/components/shared/Logo';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { getSession, getPrivateKey, clearSession, saveLocalConversations, loadLocalConversations } from '@/lib/storage';
import { getConversations, logout } from '@/lib/api';
import { wsManager } from '@/lib/websocket';
import { UserPublicInfo, MessageResponse, ConversationSummary } from '@/types/api';
import { DecryptedMessage } from '@/types/crypto';
import { decryptIncomingMessage } from '@/lib/crypto';

export default function ChatPage() {
  const router = useRouter();
  const { user, setAuth, clearAuth } = useAuthStore();
  const {
    setConversations, setActiveConversation, activeConversationId,
    conversations, setWsStatus, addMessage, updateConversationTimestamp,
    setLoadingConversations,
  } = useChatStore();

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [activePartner, setActivePartner] = useState<{
    id: string; name: string; username: string;
  } | null>(null);

  const bootstrap = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const privateKey = await getPrivateKey();
    if (!privateKey) {
      router.replace('/login');
      return;
    }

    setAuth(
      {
        id: session.userId,
        username: session.username,
        displayName: session.displayName,
        publicKey: session.publicKey,
      },
      session.accessToken,
      session.refreshToken,
      privateKey
    );

    // connect websocket with token provider for auto-refresh
    wsManager.connect(session.accessToken, async () => {
      const { getAccessToken } = await import('@/lib/api');
      return getAccessToken();
    });
    const unsubStatus = wsManager.onStatus(setWsStatus);

    // handle incoming messages globally (for conversations not currently open)
   const unsubMsg = wsManager.onMessage(async (msg: MessageResponse) => {
      try {
        const isSelf = msg.from_user_id === session.userId;
        const keyToUse = isSelf
          ? msg.payload.encryptedKeyForSelf
          : msg.payload.encryptedKey;

        const plaintext = await decryptIncomingMessage(
          msg.payload.ciphertext,
          msg.payload.iv,
          keyToUse,
          privateKey
        );

        const partnerId = isSelf
          ? msg.to_user_id
          : msg.from_user_id;

        const decrypted: DecryptedMessage = {
          id: msg.id,
          from_user_id: msg.from_user_id,
          to_user_id: msg.to_user_id,
          plaintext,
          delivered: msg.delivered,
          created_at: msg.created_at,
        };

        addMessage(partnerId, decrypted);
        updateConversationTimestamp(partnerId, msg.created_at);
        const updatedConvs = useChatStore.getState().conversations;
        saveLocalConversations(updatedConvs);

        // add to conversations list if not already there
        setConversations((prev: ConversationSummary[]) => {
          if (prev.some(c => c.user_id === partnerId)) return prev;
          return [{
            user_id: partnerId,
            display_name: msg.from_user_id === session.userId ? 'Unknown' : partnerId,
            username: partnerId,
            last_message_at: msg.created_at,
          }, ...prev];
        });
      } catch (err) {
           // decryption failure handled silently   
      }
    });
    // load conversations — try backend first, fall back to local cache
    setLoadingConversations(true);
    try {
      const convs = await getConversations();
      setConversations(convs);
      await saveLocalConversations(convs);
    } catch {
      // backend returns 500 — load from local cache
      const cached = await loadLocalConversations(session.userId);
      setConversations(cached);
    } finally {
      setLoadingConversations(false);
    }

    setIsBootstrapping(false);

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [router, setAuth, setWsStatus, setConversations,
      setLoadingConversations, addMessage, updateConversationTimestamp]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    bootstrap().then((fn) => { cleanup = fn; });
    return () => {
      cleanup?.();
      wsManager.disconnect();
    };
  }, [bootstrap]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && activePartner) {
        handleCloseConversation();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePartner]);

// global poller — runs for all conversations regardless of which is open
  useEffect(() => {
    if (!user) return;

    // record session start time to avoid counting old messages as unread
    const sessionStart = new Date().toISOString();

    const pollAll = async () => {
      const session = await getSession();
      if (!session) return;
      const privateKey = await getPrivateKey();
      if (!privateKey) return;

      const convs = useChatStore.getState().conversations;
      for (const conv of convs) {
        try {
          const raw = await getMessages(conv.user_id, undefined, 20);
          if (raw.length === 0) continue;

          const state = useChatStore.getState();
          const existing = state.messages[conv.user_id] || [];
          const existingIds = new Set(existing.map((m: DecryptedMessage) => m.id));

          // update delivered status via store action (triggers re-render)
          const deliveredIds = new Set(raw.filter(m => m.delivered).map(m => m.id));
          state.updateDeliveredStatus(conv.user_id, deliveredIds);

          // only process truly new messages
          const newRaw = raw.filter(m => !existingIds.has(m.id));
          if (newRaw.length === 0) continue;

          const decrypted = await Promise.all(
            newRaw.map(async (msg) => {
              try {
                const isSelf = msg.from_user_id === session.userId;
                const keyToUse = isSelf
                  ? msg.payload.encryptedKeyForSelf
                  : msg.payload.encryptedKey;
                const plaintext = await decryptIncomingMessage(
                  msg.payload.ciphertext,
                  msg.payload.iv,
                  keyToUse,
                  privateKey
                );
                return {
                  id: msg.id,
                  from_user_id: msg.from_user_id,
                  to_user_id: msg.to_user_id,
                  plaintext,
                  delivered: msg.delivered,
                  created_at: msg.created_at,
                } as DecryptedMessage;
              } catch {
                return {
                  id: msg.id,
                  from_user_id: msg.from_user_id,
                  to_user_id: msg.to_user_id,
                  plaintext: '',
                  delivered: msg.delivered,
                  created_at: msg.created_at,
                  decryptionFailed: true,
                } as DecryptedMessage;
              }
            })
          );

          const ordered = decrypted.reverse();
          for (const msg of ordered) {
            // only increment unread for messages that arrived after session start
            // and are not from self
            const isNew = msg.created_at > sessionStart;
            const isFromPartner = msg.from_user_id !== session.userId;
            const isActiveConv = useChatStore.getState().activeConversationId === conv.user_id;

            if (isNew && isFromPartner && !isActiveConv) {
              // manually increment unread before addMessage to control timing
              useChatStore.setState((state) => ({
                unreadCounts: {
                  ...state.unreadCounts,
                  [conv.user_id]: (state.unreadCounts[conv.user_id] || 0) + 1,
                },
              }));
            }

            // add message without auto-incrementing unread (we handle it above)
            useChatStore.setState((state) => {
              const ex = state.messages[conv.user_id] || [];
              if (ex.some((m: DecryptedMessage) => m.id === msg.id)) return state;
              return {
                messages: {
                  ...state.messages,
                  [conv.user_id]: [...ex, msg],
                },
              };
            });

            useChatStore.getState().updateConversationTimestamp(conv.user_id, msg.created_at);
          }
        } catch {
          // skip failed conversations silently
        }
      }
    };

    const interval = setInterval(pollAll, 3000);
    return () => clearInterval(interval);
  }, [user, conversations]);
  async function handleLogout() {
    const session = await getSession();
    if (session?.refreshToken) {
      await logout(session.refreshToken).catch(() => {});
    }
    wsManager.disconnect();
    await clearSession();
    clearAuth();
    router.replace('/login');
  }

  function handleSelectConversation(userId: string) {
    const conv = conversations.find((c) => c.user_id === userId);
    if (!conv) return;
    setActiveConversation(userId);
    setActivePartner({
      id: conv.user_id,
      name: conv.display_name,
      username: conv.username,
    });
    useChatStore.getState().markAsRead(userId);
  }

  function handleCloseConversation() {
    setActiveConversation(null);
    setActivePartner(null);
  }

  function handleSelectUser(u: UserPublicInfo) {
    setShowSearch(false);

    const existing = conversations.find((c) => c.user_id === u.id);
    const updated = existing ? conversations : [
      {
        user_id: u.id,
        display_name: u.display_name,
        username: u.username,
        last_message_at: null,
      },
      ...conversations,
    ];

    if (!existing) {
      setConversations(updated);
      getSession().then(s => {
        if (s) saveLocalConversations(updated);
      });
    }

    setActiveConversation(u.id);
    setActivePartner({ id: u.id, name: u.display_name, username: u.username });
  }

  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Logo size={48} />
          <Spinner size={24} className="text-indigo-400" />
          <p className="text-slate-400 text-sm">Restoring encrypted session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">

      {/* mobile: hide sidebar when conversation is active */}
      <div className={`${activePartner ? 'hidden md:flex' : 'flex'} flex-col h-full w-full md:w-auto`}>
        <Sidebar
          onNewChat={() => setShowSearch(true)}
          onLogout={handleLogout}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <main className={`flex-1 flex flex-col h-full ${!activePartner ? 'hidden md:flex' : 'flex'}`}>
        {activePartner ? (
          <>
            {/* mobile back button */}
            <div className="md:hidden px-4 py-2 border-b border-slate-800 flex items-center">
              <button
                onClick={() => { setActivePartner(null); setActiveConversation(null); }}
                className="flex items-center gap-2 text-indigo-400 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                aria-label="Back to conversations"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
            </div>
            <ConversationView
              key={activePartner.id}
              partnerId={activePartner.id}
              partnerName={activePartner.name}
              partnerUsername={activePartner.username}
              onClose={handleCloseConversation}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg mb-1">Select a conversation</h2>
            <p className="text-slate-500 text-sm mb-6 max-w-xs">
              Choose from your existing chats or start a new encrypted conversation.
            </p>
            <button
              onClick={() => setShowSearch(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Start new chat
            </button>
          </div>
        )}
      </main>

      {showSearch && (
        <UserSearch
          onSelect={handleSelectUser}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* skip link for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg">Skip to main content</a>

    </div>
  );
}