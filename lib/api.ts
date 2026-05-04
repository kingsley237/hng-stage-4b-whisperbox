import {
  AuthResponse,
  TokenResponse,
  UserPublicInfo,
  UserPublicKey,
  MessageResponse,
  ConversationSummary,
  RegisterRequest,
  SendMessageRequest,
} from '@/types/api';
import { getSession, updateAccessToken } from '@/lib/storage';

const BASE_URL = process.env.NODE_ENV === 'development'
  ? '/api/proxy'
  : 'https://whisperbox.koyeb.app';
  
export async function getAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  // refresh if token expires within 60 seconds
  if (Date.now() > session.expiresAt - 60000) {
    const refreshed = await refreshToken(session.refreshToken);
    await updateAccessToken(refreshed.access_token, refreshed.expires_in);
    return refreshed.access_token;
  }

  return session.accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authenticated) {
    const token = await getAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err.detail === 'string') {
        message = err.detail;
      } else if (Array.isArray(err.detail)) {
        message = err.detail.map((d: { msg: string }) => d.msg).join(', ');
      }
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  // 200 with empty body (logout)
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// auth endpoints
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }, false);
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }, false);
}

export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, false);
}

export async function logout(refreshToken: string): Promise<void> {
  return request<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

// user endpoints
export async function searchUsers(q: string): Promise<UserPublicInfo[]> {
  return request<UserPublicInfo[]>(`/users/search?q=${encodeURIComponent(q)}`);
}

export async function getUserPublicKey(userId: string): Promise<UserPublicKey> {
  return request<UserPublicKey>(`/users/${userId}/public-key`);
}

// conversation endpoints
export async function getConversations(): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('/conversations');
}

export async function getMessages(
  userId: string,
  before?: string,
  limit = 50
): Promise<MessageResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return request<MessageResponse[]>(`/conversations/${userId}/messages?${params}`);
}

// message endpoints
export async function sendMessage(data: SendMessageRequest): Promise<MessageResponse> {
  return request<MessageResponse>('/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}