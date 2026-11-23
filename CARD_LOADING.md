# JessDek — Card Deck Loading Spec (Matching Page)

This document specifies how the matching page loads, buffers and pages user cards.
Implement it as written. Where table or column names differ from the existing schema,
adapt the names but keep the behaviour identical.

Stack assumption: Go backend + PostgreSQL. The client may be web or mobile; client logic
below is written as a platform-agnostic state machine.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Card** | One user's display data: `uid`, `bio`, `interests`. One card = one "page". |
| **Match** | Any other user who shares **at least one interest** with the viewer, is not deleted, and is not blocked in either direction. |
| **M** | The middle card of the fan. Position `0`. |
| **Position** | Offset from M. Left is negative (`-1, -2, …`), right is positive (`+1, +2, …`). |
| **Fan** | The 5 visible cards: positions `-2 … +2`. |
| **Off-screen buffer** | Loaded cards beyond the fan's edges, kept ready so swiping never shows an empty card. |
| **Side** | Left (positions < 0) or right (positions > 0). Each side is loaded and buffered independently. |
| **CD** | "Card to deck": the deck/fan view. "Back to CD" returns from a card view to the deck. |

### Design decisions (intentional — do not change)

1. **Only M is random.** When a deck starts, M is chosen uniformly at random from the
   viewer's matches.
2. **Swiping is a rotation in `uid` order.** Right of M = the next matches with greater `uid`
   (ascending). Left of M = the next matches with smaller `uid` (descending). At the ends
   it wraps around (circular deck).
3. Variety comes from the random M plus the interest filter. Do **not** add per-deck
   shuffling, `ORDER BY random()` on page fetches, or a stored shuffled deck.
4. The card shown on top of the front-page deck **is** M. Clicking it opens the matching
   page centred on that same card, for both new and existing users.

---

## 2. Configuration (constants, not hard-coded inline)

```go
const (
    BatchSize            = 5  // S: cards fetched per refill request, per side
    VisiblePerSide       = 2  // fan = 1 + 2*VisiblePerSide = 5 cards
    OffscreenMinPerSide  = 3  // refill when fewer than this many off-screen cards remain on a side
    BufferMaxPerSide     = 10 // max loaded cards kept on each side of M (includes the 2 visible)
    SmallDeckMax         = 1 + 2*BufferMaxPerSide // 21: decks this small are loaded entirely
)
```

---

## 3. Data model (assumed)

```sql
users(
  uid         bigint PRIMARY KEY,   -- incremental
  bio         text,
  deleted_at  timestamptz NULL,     -- SOFT DELETE. Never hard-delete users.
  ...
)

user_interests(
  uid          bigint REFERENCES users(uid),
  interest_id  bigint REFERENCES interests(id),
  PRIMARY KEY (uid, interest_id)
)
CREATE INDEX ON user_interests (interest_id, uid);

blocks(
  blocker_uid  bigint,
  blocked_uid  bigint,
  PRIMARY KEY (blocker_uid, blocked_uid)
)
```

If interests are stored as a `text[]` column on `users` instead of a join table, replace the
`EXISTS (... user_interests ...)` clause with `u.interests && $my_interests` and add a GIN
index on `users.interests`. Behaviour must stay the same.

### Match filter (reuse everywhere — define once as a SQL fragment/constant)

```sql
u.uid <> $me
AND u.deleted_at IS NULL
AND EXISTS (
  SELECT 1
  FROM user_interests a
  JOIN user_interests b ON b.interest_id = a.interest_id
  WHERE a.uid = $me AND b.uid = u.uid
)
AND NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_uid = $me    AND bl.blocked_uid = u.uid)
     OR (bl.blocker_uid = u.uid  AND bl.blocked_uid = $me)
)
```

`$me` always comes from the authenticated session, **never** from the client.

---

## 4. Server API

All endpoints require authentication. Card payloads contain **only** display fields.

### Card shape

```json
{ "uid": 123, "bio": "…", "interests": ["go", "music"] }
```

### 4.1 `GET /api/deck/start`

Starts a deck: picks a random M, returns the match count `n`, and the initial cards.

**Step 1 — random M + total count in one query.** `count(*) OVER ()` is evaluated before
`ORDER BY`/`LIMIT`, so `n` is the total number of matches.

```sql
SELECT u.uid, count(*) OVER () AS n
FROM users u
WHERE <match filter>
ORDER BY random()
LIMIT 1;
```

**Step 2 — initial cards depend on `n`:**

| `n` | Mode | What to return |
|---|---|---|
| `0` | `empty` | `{ "mode": "empty", "n": 0 }` |
| `1 … SmallDeckMax` (≤ 21) | `small` | **All** matches in one query, ordered by `uid` ascending, then **rotated so M is index 0**. |
| `> SmallDeckMax` | `large` | M, plus `BatchSize` cards on each side (right: next by `uid` asc; left: next by `uid` desc), using the side queries in 4.2 including wrap-around. |

Response:

```jsonc
// small
{ "mode": "small", "n": 7, "cards": [ /* n cards, cards[0] = M, then uid-ascending with wrap */ ] }

// large
{ "mode": "large", "n": 340,
  "m": { /* card */ },
  "right": [ /* BatchSize cards, nearest first (uid ascending, wrapped) */ ],
  "left":  [ /* BatchSize cards, nearest first (uid descending, wrapped) */ ] }
```

### 4.2 `GET /api/deck/cards?dir=right&after=<uid>&limit=<k>`
### `GET /api/deck/cards?dir=left&before=<uid>&limit=<k>`

Used only in `large` mode. Clamp `limit` to `1 … BatchSize`. Validate cursors as integers.

Right (ascending):

```sql
SELECT u.uid, u.bio, <interests as text[]> AS interests
FROM users u
WHERE <match filter> AND u.uid > $after
ORDER BY u.uid ASC
LIMIT $limit;
```

Left (descending):

```sql
SELECT u.uid, u.bio, <interests as text[]> AS interests
FROM users u
WHERE <match filter> AND u.uid < $before
ORDER BY u.uid DESC
LIMIT $limit;
```

**Wrap-around:** if a side query returns `k < limit` rows, the end of the uid range was hit.
Run the same query again **without the cursor bound** (right: `ORDER BY uid ASC`, left:
`ORDER BY uid DESC`) with `LIMIT (limit - k)` and append those rows. Set `"wrapped": true`.

Response:

```json
{ "cards": [ /* nearest first */ ], "wrapped": false }
```

Why wrap is safe in large mode: the client never holds more than
`1 + (BufferMaxPerSide - 1) + BufferMaxPerSide = 20` cards, and large mode requires
`n > 21`, so a wrapped fetch cannot return a card already in the buffer. The client still
dedupes by `uid` as a guard (see 5.6), because `n` can shrink mid-session.

### 4.3 `GET /api/users/{uid}/profile`

Full card view (heavy fields, chat entry point). Not part of deck loading.
Returns **`410 Gone`** if the user is deleted or a block now exists in either direction.

---

## 5. Client state machine

### 5.1 State

```text
mode            "empty" | "small" | "large"
n               total matches at deck start
mUid            uid of the current middle card
right[]         loaded cards right of M, nearest first   (positions +1, +2, …)
left[]          loaded cards left of M, nearest first    (positions -1, -2, …)
inFlight.right  pending request cursor or null           (max ONE in flight per side)
inFlight.left   pending request cursor or null
```

### 5.2 Rendering the fan

- Render positions `-VisiblePerSide … +VisiblePerSide`.
- A visible **edge** card that is not loaded yet renders as a skeleton placeholder.
- The **center** card must not be a skeleton under normal conditions; if it is, log a
  `buffer_empty` metric event (see section 7).

### 5.3 Moving the fan

"Move right" = the card at `+1` becomes the new M.

```text
moveRight():
  left.unshift(M); M = right.shift()
  evict(left)                      // keep left.length <= BufferMaxPerSide, drop farthest
  maybeRefill("right")

moveLeft():
  right.unshift(M); M = left.shift()
  evict(right)
  maybeRefill("left")
```

### 5.4 Refill rule (large mode only)

```text
maybeRefill(side):
  offscreen = side.length - VisiblePerSide
  if offscreen < OffscreenMinPerSide and inFlight[side] == null:
      cursor = uid of the FARTHEST loaded card on that side (or mUid if side is empty)
      request BatchSize cards in that direction from cursor
      inFlight[side] = cursor
```

Steady-state behaviour this produces (do not change the constants to "fix" it):

- After `deck/start`, each side holds 5 (2 visible + 3 off-screen).
- The first move in a direction drops that side to 2 off-screen → one refill of 5 → 9 loaded.
- After that: **one refill per 5 moves** per direction.
- A refill fires while 2 off-screen cards remain, so an unloaded card would need 2 more
  moves to reach the fan edge and 4 more to reach the center. That is the lag tolerance.

### 5.5 Handling a refill response

```text
onRefill(side, requestCursor, cards):
  inFlight[side] = null
  if requestCursor != uid of current farthest card on that side:
      discard response              // side changed via eviction/direction reversal; stale
      maybeRefill(side); return
  for card in cards (nearest first):
      if card.uid already in buffer (M, left, right): skip   // dedupe guard
      side.push(card)
  evict(side)
  maybeRefill(side)                 // fast swipers may need another batch immediately
```

### 5.6 Eviction

```text
evict(side):
  while side.length > BufferMaxPerSide: side.pop()   // drop the farthest card
```

Evicted cards are simply refetched with the normal refill rule if the user reverses
direction, because the cursor is always the farthest *retained* card on that side.

### 5.7 Small mode (`n ≤ 21`)

- All `n` cards are loaded at start; **no further requests**.
- Position `p` maps to `cards[mod(p, n)]`, where `mod(p, n) = ((p % n) + n) % n`
  (Go's and JS's `%` keep the sign of `p`).
- Looping is enabled only when `n ≥ 5`.
- When `n < 5`, looping is **disabled**, the deck stops at its ends (bounce animation), and the
  fan shows only `n` cards so nobody appears twice:

| `n` | Fan positions shown |
|---|---|
| 1 | `0` |
| 2 | `0, +1` |
| 3 | `-1, 0, +1` |
| 4 | `-1, 0, +1, +2` |

### 5.8 Empty mode (`n = 0`)

Show an empty state (e.g. "No matches yet — add more interests"). No fan.

---

## 6. Edge cases

| Case | Handling |
|---|---|
| Deleted user **not yet loaded** | Excluded by `deleted_at IS NULL` in the match filter; keyset cursors skip the gap automatically. |
| Deleted user **already in the buffer** | Leave the card. When the user opens it or messages them, the server returns `410` → remove the card from the buffer, close the gap on that side, then call `maybeRefill(side)`. |
| Block created mid-session | Same as deleted: filter excludes it for future fetches; `410` on profile/chat for cards already loaded. |
| Gaps in `uid` sequence | Irrelevant. Never compute neighbours as `M ± k`; always use keyset queries. |
| End of `uid` range | Wrap-around in the server query (4.2). |
| New users sign up mid-session | They appear naturally in large mode once the rotation reaches their `uid`. In small mode they appear on the next `deck/start`. |
| `n` shrinks mid-session in large mode | Dedupe guard (5.5) prevents duplicates. |
| Rapid swiping | Max one request in flight per side; stale responses discarded (5.5); skeleton only on edge cards. |
| User reverses direction | The other side refills from its farthest retained card (5.4). |
| "Back to CD" from card view | Restore the in-memory deck state (`mUid`, `left`, `right`, `mode`, `n`). **Zero requests.** Same M as before. |
| Front page → matching page | The front page calls `deck/start`; its top card is M. Opening the matching page reuses that state — no second `deck/start`. |

---

## 7. Metrics to log

- `buffer_empty`: the center card was not loaded when it became M (target ≈ 0).
- Refill latency p95, measured **on the client** (request sent → cards appended).
- Refills per session and moves per session.
- Unused loaded cards at session end.
- Server: `pg_stat_statements` for the match filter queries (the `EXISTS` interest check runs on
  every refill; watch it if matches become sparse at scale).

---

## 8. Acceptance tests

1. `deck/start` with `n = 0, 1, 3, 4, 5, 21, 22, 100` returns the correct mode and cards; fan
   layout follows 5.7 for `n < 5`.
2. Small mode never issues a request after `deck/start`; looping works for `n ≥ 5` and is off
   for `n < 5`.
3. Large mode: 30 moves right → exactly one refill on the first move, then one per 5 moves;
   right side never exceeds 10 cards; left side never exceeds 10 cards.
4. Wrap-around: starting M near the max `uid`, moving right continues from the smallest matching
   `uid` with no duplicates and no skips.
5. Reverse direction after eviction refetches exactly the evicted cards, in order.
6. 20 rapid moves: never more than one request in flight per side; no duplicate `uid` in the fan.
7. Soft-delete a user that sits off-screen → it is never shown after refetch; soft-delete a user
   already on screen → opening it returns `410` and the card is removed cleanly.
8. Block either direction → same behaviour as delete.
9. "Back to CD" restores the exact same fan with zero network requests.
10. `$me` cannot be spoofed via query params; `limit` is clamped; card payloads contain only
    `uid`, `bio`, `interests`.
