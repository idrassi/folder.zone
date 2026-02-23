# Security Policy

## Scope

folder.zone is an end-to-end encrypted, peer-to-peer folder sharing application in the browser. Security-relevant areas include:

- **Client-side cryptography (`client/crypto.js`):** AES-256-GCM encryption, HKDF key derivation, and HMAC-SHA-256 integrity verification via Web Crypto API. Bugs here could compromise file confidentiality or integrity.
- **File handling and chunking (`client/upload.js`, `client/filehandling.js`):** Reads files from the filesystem, chunks them for transport, and encrypts each chunk. Errors could leak plaintext or bypass integrity checks.
- **Key management (`client/client.js`, `client/signaling.js`):** Generation, exchange, and storage of encryption keys via URL fragments. Flaws could expose keys to the server or third parties.
- **WebRTC peer connection (`client/peerconnection.js`):** Establishes direct peer-to-peer data channels. Misconfiguration could allow connection hijacking or downgrade attacks.
- **Signaling and relay server (`server/websocket.js`, `server/rooms.js`):** Manages room state, forwards WebRTC signaling, and relays encrypted blobs in fallback mode. Vulnerabilities could enable denial of service or room takeover.
- **Static file server (`server/staticServer.js`):** Serves the client application. Path traversal or injection bugs could expose server-side files.

## Reporting a Vulnerability

If you discover a security vulnerability in folder.zone, you are welcome to report it however you prefer. Coordinated or responsible disclosure is appreciated but not required. Choose whichever channel works best for you:

- **Public issue or pull request:** Open a [GitHub issue](https://github.com/symbolicsoft/folder.zone/issues) or submit a pull request with a fix. This is perfectly fine and gets the community involved sooner.
- **Private advisory:** Open a [private security advisory](https://github.com/symbolicsoft/folder.zone/security/advisories/new) on GitHub if you prefer to discuss the issue confidentially before it is made public.
- **Email:** Send a report to the maintainers via the contact information on [symbolic.software](https://symbolic.software).

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue or a proof of concept.
- The affected component (client-side crypto, signaling server, relay, etc.).
- The version or commit hash you tested against.

We will acknowledge receipt within 7 days and aim to provide a fix or mitigation plan within 30 days, depending on severity.

## Supported Versions

Security fixes are applied to the latest release on the `main` branch. There is no backporting to older versions.

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

## Security Considerations for Users

- **Beta software.** The implementation uses standard cryptographic primitives via Web Crypto API, but the protocol has not undergone independent security audit.
- **Link security is key security.** Encryption keys are embedded in URL fragments and never sent to the server. Treat shared links as secrets.
- **The server is assumed fully compromised.** The security model is designed so that a malicious server learns nothing beyond connection metadata and ciphertext. However, since the server serves the client code, a compromised server could serve a modified client. Self-hosting mitigates this.
- **Self-hosted instances inherit your server's security posture.** Ensure TLS is properly configured and keep dependencies up to date.
