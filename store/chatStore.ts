import { create } from 'zustand';
import { ConversationSummary } from '@/types/api';
import { DecryptedMessage } from '@/types/crypto';

interface ChatState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messages: Record<string, DecryptedMessage[]>;
  unreadCounts: Record<string, number>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  wsStatus: 'connected' | 'disconnected' | 'error';

  setConversations: (conversations: ConversationSummary[] | ((prev: ConversationSummary[]) => ConversationSummary[])) => void;
  setActiveConversation: (userId: string | null) => void;
  setMessages: (userId: string, messages: DecryptedMessage[]) => void;
  prependMessages: (userId: string, messages: DecryptedMessage[]) => void;
  addMessage: (userId: string, message: DecryptedMessage) => void;
  updateConversationTimestamp: (userId: string, timestamp: string) => void;
  markAsRead: (userId: string) => void;
  updateDeliveredStatus: (userId: string, deliveredIds: Set<string>) => void;
  setLoadingConversations: (v: boolean) => void;
  setLoadingMessages: (v: boolean) => void;
  setWsStatus: (status: 'connected' | 'disconnected' | 'error') => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  unreadCounts: {},
  isLoadingConversations: false,
  isLoadingMessages: false,
  wsStatus: 'disconnected',

  setConversations: (conversations) =>
    set(typeof conversations === 'function'
      ? (state) => ({ conversations: (conversations as (prev: ConversationSummary[]) => ConversationSummary[])(state.conversations) })
      : { conversations }),

  setActiveConversation: (userId) => set({ activeConversationId: userId }),

  setMessages: (userId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [userId]: messages },
    })),

  prependMessages: (userId, older) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [userId]: [...older, ...(state.messages[userId] || [])],
      },
    })),

  addMessage: (userId, message) =>
    set((state) => {
      const existing = state.messages[userId] || [];
      if (existing.some((m) => m.id === message.id)) return state;
      const isActive = state.activeConversationId === userId;
      const isFromPartner = message.from_user_id === userId;
      const shouldIncrement = !isActive && isFromPartner;
     return {
        messages: {
          ...state.messages,
          [userId]: [...existing, message],
        },
        unreadCounts: shouldIncrement
          ? { ...state.unreadCounts, [userId]: (state.unreadCounts[userId] || 0) + 1 }
          : state.unreadCounts,
      };
    }),

  updateConversationTimestamp: (userId, timestamp) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.user_id === userId ? { ...c, last_message_at: timestamp } : c
      ),
    })),

  markAsRead: (userId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [userId]: 0 },
    })),
    updateDeliveredStatus: (userId, deliveredIds) =>
    set((state) => {
      const existing = state.messages[userId] || [];
      const hasUndelivered = existing.some(m => !m.delivered && deliveredIds.has(m.id));
      if (!hasUndelivered) return state;
      return {
        messages: {
          ...state.messages,
          [userId]: existing.map(m =>
            deliveredIds.has(m.id) ? { ...m, delivered: true } : m
          ),
        },
      };
    }),

  setLoadingConversations: (v) => set({ isLoadingConversations: v }),
  setLoadingMessages: (v) => set({ isLoadingMessages: v }),
  setWsStatus: (status) => set({ wsStatus: status }),
}));