import { readRepoFile } from './e2e-cases';
import {
  hasTc2663UnpublishedStateContract,
  hasTc2664PublishedStateContract,
  hasTc2665LoadingDisabledContract,
  hasTc2666UpdatingDisabledContract,
  hasTc2667ToggleInvocationContract,
  hasTc2668AccessibleStateContract,
} from './tc-2663-2668';

const owner = readRepoFile('smkc-score-app', '__tests__', 'components', 'tournament', 'mode-publish-switch.test.tsx');

const asTest = (body: string) => `it('contract', async () => {\n${body}\n});`;

describe('TC-2663 through TC-2668 ModePublishSwitch drift matchers', () => {
  it('recognizes the current executable contracts', () => {
    expect(hasTc2663UnpublishedStateContract(owner)).toBe(true);
    expect(hasTc2664PublishedStateContract(owner)).toBe(true);
    expect(hasTc2665LoadingDisabledContract(owner)).toBe(true);
    expect(hasTc2666UpdatingDisabledContract(owner)).toBe(true);
    expect(hasTc2667ToggleInvocationContract(owner)).toBe(true);
    expect(hasTc2668AccessibleStateContract(owner)).toBe(true);
  });

  it('accepts equivalent state assertions without relying on test titles or quote style', () => {
    const unpublished = asTest(`
      expect(screen.getByText("Unpublished")).toBeInTheDocument();
      expect(screen.queryByText("Published")).toBeNull();
    `);
    const published = asTest(`
      mockUseModePublish.mockReturnValue({ ...defaultPublishState, isPublic: true });
      expect(screen.getByText("Published")).toBeInTheDocument();
      expect(screen.queryByText("Unpublished")).toBeNull();
    `);

    expect(hasTc2663UnpublishedStateContract(unpublished)).toBe(true);
    expect(hasTc2664PublishedStateContract(published)).toBe(true);
  });

  it('keeps loading and updating disabled contracts distinct', () => {
    const loading = asTest(`
      mockUseModePublish.mockReturnValue({ ...defaultPublishState, loading: true });
      expect(screen.getByRole('switch')).toBeDisabled();
      expect(screen.queryByText('Published')).toBeNull();
      expect(screen.queryByText('Unpublished')).toBeNull();
    `);
    const updating = asTest(`
      mockUseModePublish.mockReturnValue({ ...defaultPublishState, updating: true });
      expect(screen.getByRole('switch')).toBeDisabled();
    `);

    expect(hasTc2665LoadingDisabledContract(loading)).toBe(true);
    expect(hasTc2665LoadingDisabledContract(updating)).toBe(false);
    expect(hasTc2666UpdatingDisabledContract(updating)).toBe(true);
    expect(hasTc2666UpdatingDisabledContract(loading)).toBe(false);
  });

  it('accepts a switch query stored in a local variable', () => {
    const loading = asTest(`
      mockUseModePublish.mockReturnValue({ ...defaultPublishState, loading: true });
      const switchEl = screen.getByRole('switch');
      expect(switchEl).toBeDisabled();
      expect(screen.queryByText('Published')).toBeNull();
      expect(screen.queryByText('Unpublished')).toBeNull();
    `);
    const wrongBinding = asTest(`
      mockUseModePublish.mockReturnValue({ ...defaultPublishState, loading: true });
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(screen.queryByText('Published')).toBeNull();
      expect(screen.queryByText('Unpublished')).toBeNull();
    `);

    expect(hasTc2665LoadingDisabledContract(loading)).toBe(true);
    expect(hasTc2665LoadingDisabledContract(wrongBinding)).toBe(false);
  });

  it('requires click and toggle assertion in one executable test callback', () => {
    const complete = asTest(`
      await user.click(screen.getByRole('switch'));
      expect(toggleMock).toHaveBeenCalledTimes(1);
    `);
    const split = `${asTest(`await user.click(screen.getByRole('switch'));`)}\n${asTest(
      `expect(toggleMock).toHaveBeenCalledTimes(1);`,
    )}`;

    expect(hasTc2667ToggleInvocationContract(complete)).toBe(true);
    expect(hasTc2667ToggleInvocationContract(split)).toBe(false);
  });

  it('requires aria-checked on the stably named publish switch', () => {
    const complete = asTest(`
      const switchEl = screen.getByRole("switch", { name: "Battle Mode publication" });
      expect(switchEl).toHaveAttribute("aria-checked", "false");
    `);
    const wrongName = asTest(`
      const switchEl = screen.getByRole('switch', { name: 'Published' });
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    `);
    const wrongBinding = asTest(`
      const publishSwitch = screen.getByRole('switch', { name: 'Battle Mode publication' });
      const otherSwitch = screen.getByRole('switch', { name: 'Other switch' });
      expect(otherSwitch).toHaveAttribute('aria-checked', 'false');
    `);

    expect(hasTc2668AccessibleStateContract(complete)).toBe(true);
    expect(hasTc2668AccessibleStateContract(wrongName)).toBe(false);
    expect(hasTc2668AccessibleStateContract(wrongBinding)).toBe(false);
  });

  it('does not accept compatibility comments as executable coverage', () => {
    const comments = `
      // expect(screen.getByText('Unpublished')).toBeInTheDocument();
      // expect(screen.queryByText('Published')).toBeNull();
      // mockUseModePublish.mockReturnValue({ ...defaultPublishState, updating: true });
      // expect(screen.getByRole('switch')).toBeDisabled();
      // await user.click(screen.getByRole('switch'));
      // expect(toggleMock).toHaveBeenCalledTimes(1);
      // screen.getByRole('switch', { name: 'Battle Mode publication' });
      // expect(switchEl).toHaveAttribute('aria-checked', 'false');
    `;

    expect(hasTc2663UnpublishedStateContract(comments)).toBe(false);
    expect(hasTc2666UpdatingDisabledContract(comments)).toBe(false);
    expect(hasTc2667ToggleInvocationContract(comments)).toBe(false);
    expect(hasTc2668AccessibleStateContract(comments)).toBe(false);
  });
});
