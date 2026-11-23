-- AlterTable
ALTER TABLE "User" ADD COLUMN     "interestKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "User_interestKeys_idx" ON "User" USING GIN ("interestKeys");

-- Backfill from the cards people already saved: a built-in interest is "id:<id>", a custom one is
-- "t:<text, lower-cased>" (the same keys services/cards.ts writes on every save).
UPDATE "User" u
SET "interestKeys" = COALESCE(
  (
    SELECT array_agg(DISTINCT s.k)
    FROM (
      SELECT CASE
               WHEN jsonb_typeof(e) = 'string' THEN 'id:' || (e #>> '{}')
               WHEN jsonb_typeof(e) = 'object' AND e ? 't' THEN 't:' || lower(e ->> 't')
             END AS k
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(u."card"::jsonb -> 'interests') = 'array' THEN u."card"::jsonb -> 'interests'
          ELSE '[]'::jsonb
        END
      ) AS e
    ) s
    WHERE s.k IS NOT NULL
  ),
  ARRAY[]::TEXT[]
)
WHERE u."card" IS NOT NULL;
