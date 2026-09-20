import { withQualificationPlayerSeed } from '@/lib/api-factories/qualification-player-seed';

function successResponse(data: Record<string, unknown>): Response {
  return Response.json(
    { success: true, data },
    {
      headers: {
        ETag: '"qual-etag"',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    },
  );
}

describe('withQualificationPlayerSeed', () => {
  it('derives a bounded deduplicated seed from current qualification assignments', async () => {
    const player1 = { id: 'p1', name: 'Player One', nickname: 'One' };
    const player2 = { id: 'p2', name: 'Player Two', nickname: 'Two' };
    const response = successResponse({
      qualifications: [
        { id: 'q1', player: player1 },
        { id: 'q2', player: player2 },
        { id: 'q3', player: player1 },
      ],
      matches: [],
      qualificationConfirmed: false,
    });

    const seeded = await withQualificationPlayerSeed(response);
    const body = await seeded.json();

    expect(body.data.allPlayers).toEqual([player1, player2]);
    expect(body.data.qualifications).toHaveLength(3);
    expect(seeded.headers.get('etag')).toBe('"qual-etag"');
    expect(seeded.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
  });

  it('keeps archive responses with an existing allPlayers snapshot unchanged', async () => {
    const response = successResponse({
      qualifications: [],
      allPlayers: [{ id: 'archive-p1', name: 'Archived', nickname: 'Archive' }],
      archived: true,
    });

    await expect(withQualificationPlayerSeed(response)).resolves.toBe(response);
  });

  it('skips non-success and bodyless responses without consuming them', async () => {
    const notFound = Response.json({ success: false }, { status: 404 });
    const notModified = new Response(null, { status: 304, headers: { ETag: '"same"' } });

    await expect(withQualificationPlayerSeed(notFound)).resolves.toBe(notFound);
    await expect(withQualificationPlayerSeed(notModified)).resolves.toBe(notModified);
  });

  it('returns malformed success bodies unchanged instead of inventing a seed', async () => {
    const response = new Response('not-json', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });

    await expect(withQualificationPlayerSeed(response)).resolves.toBe(response);
  });

  it('ignores malformed and duplicate assignment player rows while preserving valid players', async () => {
    const valid = { id: 'valid', name: 'Valid', nickname: 'Valid' };
    const response = successResponse({
      qualifications: [
        { id: 'q1', player: valid },
        { id: 'q2', player: { id: '', name: 'Blank', nickname: 'Blank' } },
        { id: 'q3', player: null },
        { id: 'q4', player: valid },
      ],
    });

    const seeded = await withQualificationPlayerSeed(response);
    const body = await seeded.json();

    expect(body.data.allPlayers).toEqual([valid]);
  });
});
