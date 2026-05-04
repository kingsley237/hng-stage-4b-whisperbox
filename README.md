# WhisperBox - E2E Encrypted Messaging

End-to-end encrypted messaging app. The server stores only ciphertext - plaintext never leaves the client.

**Live demo:** [https://hng-stage-4b-whisperbox.vercel.app](https://hng-stage-4b-whisperbox.vercel.app)

**Demo video:** [https://www.loom.com/share/bbdea5b08eeb48a283ed4d187d314256](https://www.loom.com/share/bbdea5b08eeb48a283ed4d187d314256)

---

## Setup

```bash
git clone https://github.com/kingsley237/hng-stage-4b-whisperbox.git
cd hng-stage-4b-whisperbox
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture
Client (Browser)
├── Key generation (Web Crypto API)
├── Encryption/decryption (RSA-OAEP + AES-GCM)
├── Private key storage (IndexedDB, non-extractable CryptoKey)
└── Session storage (IndexedDB)
Server (whisperbox.koyeb.app)
├── Stores: ciphertext, iv, encryptedKey, encryptedKeyForSelf
└── Never sees: plaintext, raw private keys, passwords

---

## Encryption Flow

**Registration**
1. Browser generates RSA-OAEP 2048-bit keypair
2. Browser generates 16-byte random salt
3. Browser derives AES-GCM key from password + salt via PBKDF2 (100,000 iterations)
4. Browser encrypts RSA private key with AES-GCM key
5. Server receives public key + encrypted private key + salt - never the raw private key

**Login**
1. Browser re-derives AES-GCM key from password + salt
2. Browser decrypts wrapped private key into memory
3. Private key stored in IndexedDB as non-extractable CryptoKey - raw bytes never accessible

**Sending**
1. Generate random AES-GCM key + IV per message
2. Encrypt plaintext → ciphertext
3. Encrypt AES key with recipient public key → encryptedKey
4. Encrypt AES key with own public key → encryptedKeyForSelf
5. Server stores all four fields - cannot decrypt any of them

**Receiving**
1. Decrypt encryptedKey with own RSA private key → AES key
2. Decrypt ciphertext with AES key + IV → plaintext
3. Plaintext exists only in memory

---

## Key Management

| Key | Stored where | Raw bytes exposed |
|-----|-------------|-------------------|
| RSA public key | Server | Yes - intentionally public |
| RSA private key | IndexedDB (non-extractable CryptoKey) | Never |
| AES wrapping key | Never stored | Memory only during login |
| Per-message AES key | Never stored | Memory only during send/receive |

---

## Security Decisions

- **PBKDF2 at 100,000 iterations** - slows brute-force on password-derived keys
- **AES-GCM for private key wrapping** - authenticated encryption detects tampering
- **Non-extractable CryptoKey** - browser enforces raw key bytes are inaccessible to JS
- **encryptedKeyForSelf** - sender can decrypt own sent messages without a separate store
- **Web Crypto API only** - no third-party crypto libraries

---

## Known Limitations

- The backend `/conversations` endpoint returns HTTP 500 for some accounts. Conversations are cached locally as a workaround. To receive messages from a new contact, search for them first.
- WebSocket real-time push is unreliable on the shared backend. Messages are fetched via 3-second polling as fallback.
- Access tokens expire after 15 minutes and are refreshed automatically.