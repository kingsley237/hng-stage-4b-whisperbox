const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const AES_KW_LENGTH = 256;
const AES_GCM_LENGTH = 256;
const RSA_MODULUS_LENGTH = 2048;
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);
const RSA_HASH = 'SHA-256';

// convert ArrayBuffer to base64 string
export function bufToB64(buf: ArrayBuffer): string {
  // always work from a clean copy
  const clean = buf instanceof ArrayBuffer ? buf : (buf as Uint8Array).buffer;
  const bytes = new Uint8Array(clean);
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
  // always return a fresh detached ArrayBuffer
  const clean = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(clean).set(bytes);
  return clean;
}

// generate a random RSA-OAEP keypair
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: RSA_PUBLIC_EXPONENT,
      hash: RSA_HASH,
    },
    true, // extractable — needed to export public key
    ['encrypt', 'decrypt']
  );
}

// derive an AES-KW wrapping key from password + salt via PBKDF2
export async function deriveWrappingKey(
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

  // ensure clean buffer
  const cleanSalt = salt.slice(0);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: cleanSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-KW', length: AES_KW_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// wrap (encrypt) the RSA private key with AES-KW wrapping key
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('pkcs8', privateKey, wrappingKey, 'AES-KW');
}

// unwrap (decrypt) the RSA private key from AES-KW wrapping key
export async function unwrapPrivateKey(
  wrappedKeyBuf: ArrayBuffer,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  // ensure we have a clean detached ArrayBuffer
  const clean = wrappedKeyBuf.slice(0);
  return crypto.subtle.unwrapKey(
    'pkcs8',
    clean,
    wrappingKey,
    'AES-KW',
    { name: 'RSA-OAEP', hash: RSA_HASH },
    false,
    ['decrypt']
  );
}

// export RSA public key as base64 SPKI
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return bufToB64(exported);
}

// import RSA public key from base64 SPKI
export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const buf = b64ToBuf(b64);
  return crypto.subtle.importKey(
    'spki',
    buf,
    { name: 'RSA-OAEP', hash: RSA_HASH },
    false,
    ['encrypt']
  );
}

// generate a random AES-GCM key for message encryption
export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_GCM_LENGTH },
    true, // must be extractable to wrap with RSA
    ['encrypt', 'decrypt']
  );
}

// encrypt plaintext with AES-GCM, returns ciphertext + iv both as base64
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
    iv: bufToB64(iv.buffer),
  };
}

// decrypt AES-GCM ciphertext, returns plaintext string
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

// encrypt the AES key with an RSA-OAEP public key
export async function encryptAESKey(
  aesKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const exportedAES = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPublicKey,
    exportedAES
  );
  return bufToB64(encryptedBuf);
}

// decrypt the AES key with our RSA-OAEP private key
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
    decryptedBuf,
    { name: 'AES-GCM', length: AES_GCM_LENGTH },
    false,
    ['decrypt']
  );
}

// full message encryption flow:
// returns the complete EncryptedPayload ready to send to the API
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

// full message decryption flow:
// uses encryptedKey if we are the recipient, encryptedKeyForSelf if we are the sender
export async function decryptIncomingMessage(
  ciphertextB64: string,
  ivB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey
): Promise<string> {
  const aesKey = await decryptAESKey(encryptedKeyB64, privateKey);
  return decryptMessage(ciphertextB64, ivB64, aesKey);
}

// registration helper: generates keypair, derives wrapping key, wraps private key
// returns everything needed for POST /auth/register
export async function prepareRegistrationKeys(password: string): Promise<{
  publicKeyB64: string;
  wrappedPrivateKeyB64: string;
  saltB64: string;
}> {
  // generate clean detached salt buffer
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = new ArrayBuffer(16);
  new Uint8Array(salt).set(saltBytes);

  const keyPair = await generateKeyPair();
  const wrappingKey = await deriveWrappingKey(password, salt);
  const wrappedPrivateKey = await wrapPrivateKey(keyPair.privateKey, wrappingKey);
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

  return {
    publicKeyB64,
    wrappedPrivateKeyB64: bufToB64(wrappedPrivateKey),
    saltB64: bufToB64(salt),
  };
}

// login helper: re-derives wrapping key from password + stored salt, unwraps private key
export async function restorePrivateKey(
  password: string,
  wrappedPrivateKeyB64: string,
  saltB64: string
): Promise<CryptoKey> {
  const salt = b64ToBuf(saltB64);
  const wrappingKey = await deriveWrappingKey(password, salt);
  return unwrapPrivateKey(b64ToBuf(wrappedPrivateKeyB64), wrappingKey);
}