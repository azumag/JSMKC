import {
  readResponseSummary,
  summarizeResponseBody,
  uiCreatePlayer,
} from '../../e2e/lib/common';

function createResponse(status, body = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status: () => status,
    url: () => 'https://preview.smkc.bluemoon.works/api/players',
    request: () => ({ method: () => 'POST' }),
    text: jest.fn().mockResolvedValue(text),
  };
}

function createLocator(overrides = {}) {
  return {
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    first: jest.fn(function first() { return this; }),
    filter: jest.fn(function filter() { return this; }),
    getByRole: jest.fn(function getByRole() { return this; }),
    locator: jest.fn(() => createLocator()),
    waitFor: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockPage(responses) {
  const submitButton = createLocator();
  const openButton = createLocator();
  const formDialog = createLocator({
    locator: jest.fn((selector) => {
      if (selector === 'button[type="submit"]') return createLocator({ first: () => submitButton });
      return createLocator();
    }),
  });
  const passwordDialog = createLocator();

  return {
    submitButton,
    url: jest.fn(() => 'https://preview.smkc.bluemoon.works/players'),
    locator: jest.fn(() => createLocator()),
    getByRole: jest.fn((role) => {
      if (role === 'button') return createLocator({ first: () => openButton });
      if (role === 'dialog') return createLocator({
        filter: jest.fn()
          .mockReturnValueOnce(createLocator({ first: () => formDialog }))
          .mockReturnValueOnce(createLocator({ first: () => passwordDialog })),
      });
      return createLocator();
    }),
    waitForResponse: jest.fn(async (predicate) => {
      const response = responses.shift();
      if (!response || !predicate(response)) throw new Error('unexpected waitForResponse call');
      return response;
    }),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn(async (fn, nickname) => fn(nickname)),
  };
}

describe('uiCreatePlayer', () => {
  it('observes the UI retry sequence and returns the successful player without extra clicks', async () => {
    const page = createMockPage([
      createResponse(500, { success: false, error: 'temporary D1 failure' }),
      createResponse(201, {
        success: true,
        data: {
          player: { id: 'player-1' },
          temporaryPassword: 'generated-password',
        },
      }),
    ]);

    const result = await uiCreatePlayer(page, 'E2E BM TV A', 'e2e_bmtv_a_retry');

    expect(result).toEqual({
      id: 'player-1',
      name: 'E2E BM TV A',
      nickname: 'e2e_bmtv_a_retry',
      password: 'generated-password',
    });
    expect(page.submitButton.click).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-transient player-create failures', async () => {
    const page = createMockPage([
      createResponse(409, { success: false, error: 'duplicate nickname' }),
    ]);

    await expect(uiCreatePlayer(page, 'Duplicate', 'dup')).rejects.toThrow(
      /after 1 observed POST\(s\) \(409\).*duplicate nickname/,
    );
    expect(page.submitButton.click).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it('resolves the player id through the list API when UI retry ends with 409', async () => {
    const page = createMockPage([
      createResponse(500, { success: false, error: 'temporary D1 failure' }),
      createResponse(409, { success: false, error: 'duplicate nickname' }),
    ]);
    page.evaluate = jest.fn().mockResolvedValue({ id: 'player-from-list', nickname: 'e2e_bmtv_lost' });

    const result = await uiCreatePlayer(page, 'Lost Response', 'e2e_bmtv_lost');

    expect(result).toEqual({
      id: 'player-from-list',
      name: 'Lost Response',
      nickname: 'e2e_bmtv_lost',
      password: null,
    });
    expect(page.submitButton.click).toHaveBeenCalledTimes(1);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('ui player-create response helpers', () => {
  it('preserves non-JSON response bodies for diagnostics', async () => {
    await expect(readResponseSummary(createResponse(500, 'worker crashed'))).resolves.toBe('worker crashed');
  });

  it('keeps failure-body summaries bounded for E2E logs', () => {
    expect(summarizeResponseBody({ error: 'x'.repeat(1000) }).length).toBeLessThanOrEqual(500);
  });
});
