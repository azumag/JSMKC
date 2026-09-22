/**
 * Add a bounded setup-player seed to live qualification GET responses.
 *
 * BM/MR/GP setup dialogs use server-side search as the authoritative discovery
 * path. Their polling payload only needs enough player metadata to keep the
 * currently assigned qualification players visible between polls. Deriving that
 * seed from the already-fetched qualification rows avoids a second global
 * `/api/players` request without adding another database query.
 *
 * Archived qualification payloads already contain their canonical `allPlayers`
 * snapshot. Those responses are returned unchanged.
 */
export async function withQualificationPlayerSeed(response: Response): Promise<Response> {
  if (!response.ok || response.status === 204 || response.status === 304) return response;

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response;

  const wrapper = payload as Record<string, unknown>;
  const wrappedData = wrapper.data;
  const data =
    wrappedData && typeof wrappedData === 'object' && !Array.isArray(wrappedData)
      ? (wrappedData as Record<string, unknown>)
      : wrapper;

  // Archived responses intentionally retain the archive-wide player snapshot.
  if (Array.isArray(data.allPlayers)) return response;

  const qualifications = data.qualifications;
  if (!Array.isArray(qualifications)) return response;

  const seen = new Set<string>();
  const allPlayers: Record<string, unknown>[] = [];

  for (const qualification of qualifications) {
    if (!qualification || typeof qualification !== 'object' || Array.isArray(qualification)) continue;
    const player = (qualification as Record<string, unknown>).player;
    if (!player || typeof player !== 'object' || Array.isArray(player)) continue;

    const playerRecord = player as Record<string, unknown>;
    const id = playerRecord.id;
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;

    seen.add(id);
    allPlayers.push(playerRecord);
  }

  const seededData = { ...data, allPlayers };
  const seededPayload = data === wrapper ? seededData : { ...wrapper, data: seededData };
  const headers = new Headers(response.headers);
  // A cloned representation has a different byte length even though its ETag
  // remains valid: the seed is a deterministic projection of qualifications,
  // which are already part of the ETag input.
  headers.delete('content-length');

  return new Response(JSON.stringify(seededPayload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
