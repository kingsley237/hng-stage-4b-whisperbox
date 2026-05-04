'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import MessageBubble from '@/components/chat/MessageBubble';
import MessageInput from '@/components/chat/MessageInput';
import EncryptionBadge from '@/components/shared/EncryptionBadge';
import Spinner from '@/components/shared/Spinner';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { getMessages, getUserPublicKey, sendMessage } from '@/lib/api';
import { encryptForRecipient, decryptIncomingMessage } from '@/lib/crypto';
import { getPrivateKey } from '@/lib/storage';
import { wsManager } from '@/lib/websocket';
import { MessageResponse } from '@/types/api';
import { DecryptedMessage } from '@/types/crypto';

interface Props {
  partnerId: string;
  partnerName: string;
  partnerUsername: string;
  onClose?: () => void;
}


export default function ConversationView({ partnerId, partnerName, partnerUsername, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const { messages, addMessage, setMessages, prependMessages,
    isLoadingMessages, setLoadingMessages, updateConversationTimestamp } = useChatStore();

  const threadMessages = messages[partnerId] || [];
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const privateKeyRef = useRef<CryptoKey | null>(null);

  async function getKey(): Promise<CryptoKey | null> {
    if (privateKeyRef.current) return privateKeyRef.current;
    const key = await getPrivateKey();
    privateKeyRef.current = key;
    return key;
  }

  async function decryptMsg(msg: MessageResponse): Promise<DecryptedMessage> {
    try {
      const privateKey = await getKey();
      if (!privateKey) throw new Error('No private key');

      const isSelf = msg.from_user_id === user?.id;
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
      };
    } catch {
      return {
        id: msg.id,
        from_user_id: msg.from_user_id,
        to_user_id: msg.to_user_id,
        plaintext: '',
        delivered: msg.delivered,
        created_at: msg.created_at,
        decryptionFailed: true,
      };
    }
  }

  const loadInitial = useCallback(async () => {
    setLoadingMessages(true);
    try {
      // API returns newest-first, reverse to get oldest-first for display
      const raw = await getMessages(partnerId, undefined, 50);
      const decrypted = await Promise.all(raw.map(decryptMsg));
      const ordered = decrypted.reverse(); // oldest first
      setMessages(partnerId, ordered);
      setHasMore(raw.length === 50);
    } finally {
      setLoadingMessages(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);


  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // scroll to bottom on initial load and new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);


  // listen for incoming ws messages
  useEffect(() => {
    const unsub = wsManager.onMessage(async (msg: MessageResponse) => {
      const isRelevant =
        (msg.from_user_id === partnerId && msg.to_user_id === user?.id) ||
        (msg.from_user_id === user?.id && msg.to_user_id === partnerId);

      if (!isRelevant) return;

      const decrypted = await decryptMsg(msg);
      addMessage(partnerId, decrypted);
      updateConversationTimestamp(partnerId, msg.created_at);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, user?.id]);

  async function loadMore() {
    if (isLoadingMore || !hasMore || threadMessages.length === 0) return;
    const oldest = threadMessages[0];
    setIsLoadingMore(true);
    try {
      const raw = await getMessages(partnerId, oldest.created_at, 50);
      const decrypted = await Promise.all(raw.map(decryptMsg));
      const ordered = decrypted.reverse();
      prependMessages(partnerId, ordered);
      setHasMore(raw.length === 50);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleSend(text: string) {
    if (!user) return;

    const { public_key: recipientPublicKey } = await getUserPublicKey(partnerId);
    const payload = await encryptForRecipient(text, recipientPublicKey, user.publicKey);

    const res = await sendMessage({ to: partnerId, payload });
    const decrypted = await decryptMsg(res);
    addMessage(partnerId, decrypted);
    updateConversationTimestamp(partnerId, res.created_at);

    // also try WebSocket for real-time delivery to recipient
    wsManager.sendMessage(partnerId, payload);
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">

      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
            <span className="text-indigo-300 text-sm font-semibold">
              {partnerName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{partnerName}</p>
            <p className="text-slate-500 text-xs">@{partnerUsername}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EncryptionBadge />
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close conversation"
              className="hidden md:flex w-7 h-7 rounded-lg hover:bg-slate-800 items-center justify-center text-slate-400 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">

        {hasMore && !isLoadingMessages && (
          <div className="flex justify-center py-3 flex-shrink-0">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition flex items-center gap-2 disabled:opacity-50"
            >
              {isLoadingMore ? <Spinner size={12} className="text-indigo-400" /> : null}
              {isLoadingMore ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {isLoadingMessages && (
          <div className="flex justify-center py-8">
            <Spinner size={20} className="text-indigo-400" />
          </div>
        )}

        {!isLoadingMessages && threadMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm font-medium">No messages yet</p>
            <p className="text-slate-600 text-xs mt-1">Send an encrypted message to start</p>
          </div>
        )}

        {/* messages in chronological order — oldest at top, newest at bottom */}
        {threadMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.from_user_id === user?.id}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} disabled={isLoadingMessages} />
    </div>
  );
}