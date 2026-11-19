# DIRCOM: how photo and video sharing works

Realtime sends photos and videos **directly between people's browsers**. The server never stores
them: it keeps a small description of each file, introduces the two browsers to each other, and,
only when a direct connection is impossible, passes the bytes through its memory without keeping
them.

This document describes what was built, which technology does each job, why it was chosen, and
what could have been used instead. Paths are relative to the repo root.

---

## 1. The journey of a photo

```
 Alice's browser                    Server                        Bob's browser
 ───────────────                    ──────                        ─────────────
 1. pick / paste / drop
 2. resize, re-encode, hash
 3. sendMessage(metadata) ───────▶  saves an Attachment row
                                    MessageAdded ───────────────▶ 4. blurred placeholder
                                                                  5. "who has this file?"
 6. "I have it" (HAVE) ◀──────────  forwards to online members ◀─
            ◀─────── WebRTC offer / answer / ICE, via the server ───────▶
 7. ══════════════ bytes over a direct, encrypted data channel ═══════════▶
                                                                  8. check size, hash, type
                                                                  9. save; Bob can share it too
```

1. **Pick.** The composer accepts files from the attach button, paste, or drag and drop. Cheap
   checks run at once: at most 10 per message, only photos and MP4 / WebM / MOV videos, and size limits.
   
2. **Prepare.** Photos are decoded, resized to 2048 px on the long edge (4096 px with "HD"), and
   re-encoded as WebP. Re-encoding removes EXIF, GPS and other hidden metadata. Videos are left
   byte for byte; only a poster frame and the duration are taken from them. A tiny blurred preview
   (ThumbHash) and a SHA-256 hash are computed for each file.
   
3. **Send.** The message goes to the server with **metadata only**: type, size, dimensions,
   duration, hash, poster hash and the blurred preview. The file stays in Alice's browser, held in
   memory at first and then in IndexedDB.
   
4. **Placeholder.** Bob instantly sees the bubble at its final size, filled with the blurred
   preview, so nothing jumps when the photo arrives.
   
5. **Locate.** When the tile scrolls near the screen (and the auto-download setting allows it),
   Bob's browser asks the server who has this file. The server asks the **online devices of the
   chat's members**, not just the sender.
   
6. **Answer.** Any device that holds the file *for that chat* answers "HAVE". Bob takes the
   first answer.
   
7. **Transfer.** The two browsers open a WebRTC connection (the server only relays the short
   setup messages) and stream the file in 64 KiB chunks.
   
8. **Verify.** Bob checks the byte count, the SHA-256 hash and the file's first bytes (its "magic
   number") against the metadata. Anything wrong is thrown away and another holder is tried.
   
9. **Keep.** The file is saved in Bob's IndexedDB, tagged with the chat. Bob's browser can now
   answer the next person's request, so a group's photos stay available after the sender goes
   offline.

**Videos** work the same way, except that the poster frame is fetched first and on its own, and
the video file itself is fetched when someone opens it (or automatically for videos up to 50 MB if
the setting is "Photos & videos").

**If no one who has the file is online**, the tile says "Waiting for Alice to come online" and
fills itself in when a member comes online, when Bob reconnects, or on a 60-second retry while
the tab is visible.

---

## 2. Technology, and why

| Job | What is used | Why this | What else could be used |
| --- | --- | --- | --- |
| Moving the bytes | **WebRTC `RTCDataChannel`** (SCTP over DTLS) | Built into every browser, encrypted by default, peer to peer, so the server never handles the file | WebTransport (client to server only, so it would need server storage); plain HTTP or WebSocket upload to the server (simpler, but the server would hold the files) |
| Setting up the connection ("signaling") | GraphQL mutations (`requestMedia`, `sendSignal`) sent **over the existing graphql-ws WebSocket**, with replies on the existing `events` subscription | No new server or protocol. The server knows which tab (peer id) is on which socket, so it can stamp and check every message | A separate signaling WebSocket, Socket.IO, or HTTP plus Server-Sent Events |
| Getting through home routers (NAT) | **STUN** (Google's public server by default), configurable with `ICE_SERVERS` | Free, and enough for most home and mobile networks | A **TURN** server such as coturn, which relays when STUN fails. It's the standard choice, but it's another service to run and pay bandwidth for |
| When a direct link fails | A built-in **in-memory WebSocket relay** at `/media-relay` (the `ws` library) | Works behind strict firewalls with no extra container; frames only pass through memory | TURN (above). A relay that stores the file temporarily (simplest, but breaks "never stored") |
| Keeping the relay private | **AES-256-GCM** in the browser (WebCrypto). The requester makes a key, which reaches the holder in the setup message. Each frame's IV is a direction byte, a per-transfer salt and a counter | The relay sees only ciphertext; replayed or reflected frames are rejected | An ECDH key exchange, so even the signaling path never sees the key (protects against a modified server); a full protocol such as Signal or MLS |
| Storing files on the device | **IndexedDB** through `idb`, plus a `BroadcastChannel` so tabs of the same browser stay in sync | Holds large Blobs, works in every browser, survives reloads | OPFS (Origin Private File System), better for very large files streamed to disk; the Cache API. localStorage is too small |
| Hashing | **SHA-256** from `@noble/hashes`, incremental, in a Web Worker | Works on plain-HTTP LAN deployments (WebCrypto's `digest` needs HTTPS); streams 4 MiB slices, so a 100 MB video is never fully in memory twice; no WASM, so the CSP stays simple | WebCrypto `crypto.subtle.digest` (fast, but needs HTTPS and the whole file in memory); BLAKE3 via WASM (faster) |
| Resizing photos | `createImageBitmap` (honours EXIF rotation) and **OffscreenCanvas** in a Web Worker, encoded with `convertToBlob` to WebP. Falls back to JPEG, or PNG if the photo has transparency, where WebP encoding isn't supported. GIFs pass through untouched to keep animation | No libraries, off the main thread, and re-encoding strips location data by design | libvips or Squoosh codecs via WASM (better quality per byte, but large downloads); sending originals untouched (keeps GPS data) |
| Video posters | A hidden `<video>` element, seeked to 10 % (at most 1 s), drawn to a canvas, saved as WebP of at most 512 KiB | No dependencies; works for anything the browser can play. MediaRecorder WebM files with no duration are handled by seeking to the end first | **WebCodecs** (exact frame decoding, and could transcode HEVC to H.264); ffmpeg.wasm (works on anything, but about 25 MB) |
| Blurred placeholders | **ThumbHash** (about 25 bytes, stored in the database) | Tiny, keeps colours and transparency, and shows the photo's shape before any bytes arrive | BlurHash (similar, no transparency); a single average colour; a tiny JPEG preview (larger) |
| What the server stores | PostgreSQL via **Prisma**: an `Attachment` row per file, validated with **zod** | Gives unread counts, previews, and offline delivery of the *message*, without bytes | No row at all (purely live; offline people would never know a photo was sent) |
| Integrity checks | Size, SHA-256 and file-signature sniffing (`format.ts`) | A holder can't send a different file, or an HTML page disguised as a photo | Digital signatures from the sender, which would also prove *who* made the file |
| Download scheduling | A small download manager (`downloads.ts`): one entry per file hash, at most 3 at a time, highest priority first (viewer > on screen > prefetch), 3 attempts, resumes from the last byte | Identical files download once; the photo you open jumps the queue; a dropped link resumes | A Service Worker with Background Fetch (keeps going when the tab is closed, but limited browser support) |

---

## 3. Safety rules

- **Nothing big reaches the server.** HTTP and GraphQL bodies are capped at 64 KiB, and a test
  fails if any database column could hold bytes.
- **Only members can ask** for a file, and only online devices of *current* members are asked.
  Leaving a group, or being removed from one, cancels that person's pending requests.
- **Peer ids can't be stolen.** Each tab's random id is bound to its user; a socket claiming
  someone else's id is refused. The server stamps who sent each signal and only passes signals
  between the two devices of a live request (expires after 2 minutes).
- **A holder only serves** the exact hash the server named, only to that request's requester,
  and only if it received the file **in that same chat**. This stops someone from posting a fake
  attachment with a hash guessed from another chat to pull a private file out of you.
- **Blocking applies here too.** Two people with a block between them never connect directly,
  because WebRTC reveals each side's IP address.
- **"Hide my IP address"** (Settings) forces the relay for your transfers, in both directions.
- **Signing out wipes** every photo and video stored on that device, closes connections, and
  changes the tab's peer id.

---

## 4. Limits

| Limit | Value |
| --- | --- |
| Attachments per message | 10 |
| Photo before / after processing | 50 MB / 20 MB (`MEDIA_MAX_IMAGE_MB`) |
| Video | 100 MB (`MEDIA_MAX_VIDEO_MB`) |
| Chunk size, buffer high / low water | 64 KiB, 4 MiB / 1 MiB |
| Wait for a "HAVE" / for a direct connection | 1.5 s / 8 s, then the relay |
| Relay frame, join timeout, idle timeout | 256 KiB, 20 s, 30 s |
| Rate limits | 60 requests / 10 s per user · 300 signals / 10 s per tab · 10 relays / 10 s and 4 at once per user |

---

## 5. Trade-offs to know about

- **Nobody online with the file means no download.** This is the price of "never stored on the
  server". The app says so plainly and recovers by itself.
- **Direct connections reveal IP addresses** to the other person. "Hide my IP address" avoids it,
  at the cost of speed.
- **Video location metadata is not removed** (photos' is). A small MP4 rewriter could strip it.
- **Big videos are held in memory while receiving.** Writing chunks straight to OPFS would remove
  that limit.
- **One server instance only.** Online devices and relays are tracked in memory. Several instances
  would need Redis (or similar) for events and sticky routing for relays.
- **No server-side moderation is possible**, because the server never sees content.

---

## 6. Where it lives in the code

| Area | Files |
| --- | --- |
| Server: metadata and limits | `apps/server/src/services/messages.ts`, `apps/server/prisma/schema.prisma`, `apps/server/src/config.ts` |
| Server: peers, requests, signals | `apps/server/src/services/peers.ts`, `apps/server/src/services/media.ts` |
| Server: relay | `apps/server/src/relay.ts` |
| Browser: engine | `apps/web/src/features/media/` (`prepare`, `store`, `worker` + `ops`, `peer`, `relay`, `serve`, `fetch`, `signals`, `downloads`) |
| Browser: interface | `apps/web/src/features/chat/media/` (tray, bubble, tiles, viewer), `apps/web/src/features/chat/Composer.tsx` |
| Tests | `apps/server/test/`, `apps/web/src/features/media/*.test.ts`, `e2e/tests/media.spec.ts` |
