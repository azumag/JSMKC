import { clickWithDiagnostics } from '../../e2e/lib/common';

function createLocator(overrides = {}) {
  return {
    click: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(1),
    isVisible: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockResolvedValue(true),
    boundingBox: jest.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 40 }),
    textContent: jest.fn().mockResolvedValue('Save'),
    evaluate: jest.fn().mockResolvedValue({
      targetTag: 'BUTTON',
      targetText: 'Save',
      topTag: 'DIV',
      topText: 'Loading',
      topPointerEvents: 'auto',
      targetPointerEvents: 'auto',
      activeTag: 'BODY',
    }),
    ...overrides,
  };
}

describe('clickWithDiagnostics', () => {
  it('adds locator state and covering element details when a click fails', async () => {
    const locator = createLocator({
      click: jest.fn().mockRejectedValue(new Error('locator.click: Timeout 30000ms exceeded')),
      isEnabled: jest.fn().mockResolvedValue(false),
    });

    await expect(clickWithDiagnostics(locator, 'TC-604 save finals score')).rejects.toThrow(
      /TC-604 save finals score click failed: locator\.click: Timeout 30000ms exceeded; count=1 visible=true enabled=false box=10,20,100,40 text="Save" top=DIV "Loading" topPointerEvents=auto target=BUTTON "Save" targetPointerEvents=auto active=BODY/,
    );
  });

  it('omits elementFromPoint details when the locator has no bounding box', async () => {
    const locator = createLocator({
      click: jest.fn().mockRejectedValue(new Error('locator.click: Timeout 30000ms exceeded')),
      boundingBox: jest.fn().mockResolvedValue(null),
    });

    await expect(clickWithDiagnostics(locator, 'TC-604 missing box')).rejects.toThrow(
      /TC-604 missing box click failed: locator\.click: Timeout 30000ms exceeded; count=1 visible=true enabled=true box=n\/a text="Save"/,
    );
    expect(locator.evaluate).not.toHaveBeenCalled();
  });

  it('keeps diagnostics useful when locator state readers fail', async () => {
    const locator = createLocator({
      click: jest.fn().mockRejectedValue(new Error('locator.click: Timeout 30000ms exceeded')),
      count: jest.fn().mockRejectedValue(new Error('detached')),
      isVisible: jest.fn().mockRejectedValue(new Error('not attached')),
      boundingBox: jest.fn().mockResolvedValue(null),
    });

    await expect(clickWithDiagnostics(locator, 'TC-604 reader errors')).rejects.toThrow(
      /count="count_error:detached" visible="visible_error:not attached" enabled=true box=n\/a text="Save"/,
    );
  });

  it('does not collect diagnostics when the click succeeds', async () => {
    const locator = createLocator();

    await expect(clickWithDiagnostics(locator, 'TC-604 success')).resolves.toBeUndefined();

    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(locator.count).not.toHaveBeenCalled();
    expect(locator.evaluate).not.toHaveBeenCalled();
  });
});
