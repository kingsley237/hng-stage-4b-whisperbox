export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKeyB64: string;
  wrappedPrivateKeyB64: string;
  saltB64: string;
}

export interface DecryptedMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  plaintext: string;
  delivered: boolean;
  created_at: string;
  decryptionFailed?: boolean;
}