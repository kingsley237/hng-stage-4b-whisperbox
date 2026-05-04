const WS_URL = 'wss://whisperbox.koyeb.app/ws';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

import { MessageResponse } from '@/types/api';

type MessageHandler = (message: MessageResponse) => void;
type StatusHandler = (status: 'connected' | 'disconnected' | 'error') => void;
type TokenProvider = () => Promise<string>;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private tokenProvider: TokenProvider | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  connect(token: string, tokenProvider?: TokenProvider): void {
    this.token = token;
    this.tokenProvider = tokenProvider || null;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  private async openConnection(): Promise<void> {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    // get fresh token if provider available
    if (this.tokenProvider) {
      try {
        this.token = await this.tokenProvider();
      } catch {
        // use existing token
      }
    }

    if (!this.token) return;

    try {
      this.ws = new WebSocket(`${WS_URL}?token=${this.token}`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        const msg = frame.payload ?? frame;
        if (msg && msg.id && msg.from_user_id && msg.payload) {
          this.messageHandlers.forEach(h => h(msg));
        }
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.notifyStatus('disconnected');
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // error event always followed by close — let onclose handle reconnect
    };
  }

  send(message: { type: string; payload?: unknown; to?: string }): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  sendMessage(to: string, payload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  }): boolean {
    return this.send({
      type: 'message.send',
      to,
      payload,
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.token = null;
    this.tokenProvider = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.openConnection();
    }, delay);
  }

  private notifyStatus(status: 'connected' | 'disconnected' | 'error'): void {
    this.statusHandlers.forEach(h => h(status));
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();