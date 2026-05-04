import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'whisperbox';
const DB_VERSION = 1;

interface WhisperBoxDB extends DBSchema {
  session: {
    key: string;
    value: {
      userId: string;
      username: string;
      displayName: string;
      publicKey: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    };
  };
  privateKey: {
    key: string;
    value: CryptoKey;
  };
}

let dbPromise: Promise<IDBPDatabase<WhisperBoxDB>> | null = null;

function getDB(): Promise<IDBPDatabase<WhisperBoxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WhisperBoxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session');
        }
        if (!db.objectStoreNames.contains('privateKey')) {
          db.createObjectStore('privateKey');
        }
      },
    });
  }
  return dbPromise;
}

// session management
export async function saveSession(data: {
  userId: string;
  username: string;
  displayName: string;
  publicKey: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const db = await getDB();
  await db.put('session', {
    userId: data.userId,
    username: data.username,
    displayName: data.displayName,
    publicKey: data.publicKey,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
  }, 'current');
}

export async function getSession(): Promise<WhisperBoxDB['session']['value'] | null> {
  const db = await getDB();
  const result = await db.get('session', 'current');
  return result ?? null;
}

export async function updateAccessToken(
  accessToken: string,
  expiresIn: number
): Promise<void> {
  const db = await getDB();
  const session = await db.get('session', 'current');
  if (!session) return;
  await db.put('session', {
    ...session,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  }, 'current');
}

export async function clearSession(): Promise<void> {
  const db = await getDB();
  await db.delete('session', 'current');
  await db.delete('privateKey', 'current');
  dbPromise = null;
}

// private key management — stored as non-extractable CryptoKey in IndexedDB
// never stored as raw bytes
export async function savePrivateKey(privateKey: CryptoKey): Promise<void> {
  const db = await getDB();
  await db.put('privateKey', privateKey, 'current');
}

export async function getPrivateKey(): Promise<CryptoKey | null> {
  const db = await getDB();
  const result = await db.get('privateKey', 'current');
  return result ?? null;
}

// local conversation cache — persists across sessions
export async function saveLocalConversations(
  conversations: Array<{
    user_id: string;
    display_name: string;
    username: string;
    last_message_at: string | null;
  }>
): Promise<void> {
  const db = await getDB();
  const session = await db.get('session', 'current');
  if (!session) return;
  await db.put('session', {
    ...session,
    // store as JSON string in a new field — reuse session store
  }, 'current');
  // store separately in localStorage as JSON (conversations are not sensitive)
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      `wb_conversations_${session.userId}`,
      JSON.stringify(conversations)
    );
  }
}

export async function loadLocalConversations(userId: string): Promise<Array<{
  user_id: string;
  display_name: string;
  username: string;
  last_message_at: string | null;
}>> {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(`wb_conversations_${userId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}