/**
 * create-player-retry.ts
 *
 * Extracted from players/page.tsx's handleSubmit so the POST /api/players
 * retry-and-classify logic can be unit tested directly, without mounting
 * the full page component or driving the Radix "Add Player" dialog in
 * jsdom (this project's other page-level tests keep such logic in small
 * lib/hook functions for the same reason — see src/lib/fetch-with-retry.ts,
 * src/lib/hooks/useQualificationActions.ts).
 *
 * Background on the retry: this app used to run on Cloudflare Workers with
 * Neon/Prisma, where a cold-start crash (HTTP 1101) could tear down the
 * response stream AFTER the INSERT had already committed. Player.nickname
 * has a unique DB constraint, so retrying the identical POST after such a
 * crash deterministically comes back 409 (nickname already taken — by the
 * row the crashed attempt just created). That is a "recovered success":
 * the player exists, we just never saw the first response body.
 */

export interface CreatePlayerFormData {
  name: string;
  nickname: string;
  country: string;
  noCamera: boolean;
}

export type CreatePlayerResult =
  | { ok: true; recovered: boolean; data: Record<string, unknown> }
  | { ok: false; error: string | null; code: string | null };

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

/**
 * POSTs a new player to /api/players, retrying up to MAX_ATTEMPTS times on
 * transient 5xx failures.
 */
export async function createPlayerWithRetry(
  formData: CreatePlayerFormData,
): Promise<CreatePlayerResult> {
  let response: Response | null = null;

  /**
   * Whether the loop broke on a "recovered success" 409 — i.e. a 409
   * returned on a RETRY attempt (attempt > 0). This must be captured
   * explicitly DURING the loop and never re-derived from
   * `response.status === 409` afterwards, because that status alone is
   * ambiguous: a 409 on the FIRST attempt (attempt === 0) is a genuine
   * duplicate-nickname collision with a player that already existed
   * before this submission, not a lost response from our own request.
   * Collapsing both cases into "status === 409 => success" is the exact
   * bug this flag prevents (real duplicate-nickname errors were
   * previously reported as success, so the UI showed no error, closed
   * the dialog, and inserted a fake local player that does not exist in
   * the database).
   */
  let recovered = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    response = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (response.ok) break;
    // 409 on retry = player was created on a previous attempt that crashed
    // before sending the response. Treat as success (but password is lost).
    if (response.status === 409 && attempt > 0) {
      recovered = true;
      break;
    }
    // Any other 4xx (including a first-attempt 409 duplicate) is a real
    // client error — stop retrying and fall through to the error branch.
    if (response.status < 500) break;
    if (attempt < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  const finalResponse = response as Response;

  if (finalResponse.ok || recovered) {
    // Recovered success has no readable body — the response that carried
    // the real one was lost to the crash, so there is nothing to parse.
    const rawJson = recovered ? {} : await finalResponse.json().catch(() => ({}));
    const data = (rawJson as { data?: unknown }).data ?? rawJson;
    return { ok: true, recovered, data: data as Record<string, unknown> };
  }

  const text = await finalResponse.text();
  try {
    const parsed = JSON.parse(text);
    return { ok: false, error: parsed?.error ?? null, code: parsed?.code ?? null };
  } catch {
    return { ok: false, error: null, code: null };
  }
}
