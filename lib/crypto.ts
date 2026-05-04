const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const AES_GCM_LENGTH = 256;
const RSA_MODULUS_LENGTH = 2048;
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);
const RSA_HASH = 'SHA-256';

function cleanBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const clean = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(clean).set(bytes);
  return clean;
}

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return cleanBuffer(bytes);
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: RSA_PUBLIC_EXPONENT,
      hash: RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return bufToB64(exported);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64ToBuf(b64),
    { name: 'RSA-OAEP', hash: RSA_HASH },
    false,
    ['encrypt']
  );
}

// derive AES-GCM key from password + salt via PBKDF2
// used to encrypt/decrypt the private key
async function deriveAESKey(
  password: string,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: cleanBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_GCM_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// encrypt private key with AES-GCM derived from password
// returns iv + ciphertext concatenated as base64
async function encryptPrivateKey(
  privateKey: CryptoKey,
  aesKey: CryptoKey
): Promise<ArrayBuffer> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    cleanBuffer(exported)
  );
  // prepend iv to ciphertext
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return cleanBuffer(result);
}

// decrypt private key with AES-GCM derived from password
async function decryptPrivateKey(
  encryptedBuf: ArrayBuffer,
  aesKey: CryptoKey
): Promise<CryptoKey> {
  const data = new Uint8Array(encryptedBuf);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const pkcs8 = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: cleanBuffer(iv) },
    aesKey,
    cleanBuffer(ciphertext)
  );
  return crypto.subtle.importKey(
    'pkcs8',
    cleanBuffer(pkcs8),
    { name: 'RSA-OAEP', hash: RSA_HASH },
    false,
    ['decrypt']
  );
}

export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_GCM_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(
  plaintext: string,
  aesKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(plaintext)
  );
  return {
    ciphertext: bufToB64(ciphertextBuf),
    iv: bufToB64(cleanBuffer(iv)),
  };
}

export async function decryptMessage(
  ciphertextB64: string,
  ivB64: string,
  aesKey: CryptoKey
): Promise<string> {
  const dec = new TextDecoder();
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(ivB64) },
    aesKey,
    b64ToBuf(ciphertextB64)
  );
  return dec.decode(plaintextBuf);
}

export async function encryptAESKey(
  aesKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const exportedAES = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPublicKey,
    cleanBuffer(exportedAES)
  );
  return bufToB64(encryptedBuf);
}

export async function decryptAESKey(
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    b64ToBuf(encryptedKeyB64)
  );
  return crypto.subtle.importKey(
    'raw',
    cleanBuffer(decryptedBuf),
    { name: 'AES-GCM', length: AES_GCM_LENGTH },
    false,
    ['decrypt']
  );
}

export async function encryptForRecipient(
  plaintext: string,
  recipientPublicKeyB64: string,
  senderPublicKeyB64: string
): Promise<{
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}> {
  const [recipientPubKey, senderPubKey] = await Promise.all([
    importPublicKey(recipientPublicKeyB64),
    importPublicKey(senderPublicKeyB64),
  ]);

  const aesKey = await generateMessageKey();
  const { ciphertext, iv } = await encryptMessage(plaintext, aesKey);
  const [encryptedKey, encryptedKeyForSelf] = await Promise.all([
    encryptAESKey(aesKey, recipientPubKey),
    encryptAESKey(aesKey, senderPubKey),
  ]);

  return { ciphertext, iv, encryptedKey, encryptedKeyForSelf };
}

export async function decryptIncomingMessage(
  ciphertextB64: string,
  ivB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<string> {
  const aesKey = await decryptAESKey(encryptedKeyB64, privateKey);
  return decryptMessage(ciphertextB64, ivB64, aesKey);
}

export async function prepareRegistrationKeys(password: string): Promise<{
  publicKeyB64: string;
  wrappedPrivateKeyB64: string;
  saltB64: string;
}> {
  // generate clean salt
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = cleanBuffer(saltBytes);

  const keyPair = await generateKeyPair();

  // derive AES-GCM key from password + salt
  const aesKey = await deriveAESKey(password, salt);

  // encrypt private key with AES-GCM (not AES-KW — avoids alignment issues)
  const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKey, aesKey);
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

  return {
    publicKeyB64,
    wrappedPrivateKeyB64: bufToB64(encryptedPrivateKey),
    saltB64: bufToB64(salt),
  };
}

export async function restorePrivateKey(
  password: string,
  wrappedPrivateKeyB64: string,
  saltB64: string
): Promise<CryptoKey> {
  const salt = b64ToBuf(saltB64);
  const aesKey = await deriveAESKey(password, salt);
  return decryptPrivateKey(b64ToBuf(wrappedPrivateKeyB64), aesKey);
}