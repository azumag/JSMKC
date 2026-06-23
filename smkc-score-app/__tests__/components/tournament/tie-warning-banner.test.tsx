/**
 * @jest-environment jsdom
 *
 * Unit tests for the TieWarningBanner component (TC-2653 through TC-2656).
 *
 * TieWarningBanner renders a yellow warning when tied ranks exist in a
 * qualification group. Admins see a prompt to run a sudden-death playoff;
 * viewers see a "pending resolution" notice.
 */
import { render, screen } from '@testing-library/react';
import { TieWarningBanner } from '@/components/tournament/tie-warning-banner';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TieWarningBanner', () => {
  it('TC-2653: renders nothing when hasTies is false (admin)', () => {
    const { container } = render(
      <TieWarningBanner hasTies={false} isAdmin={true} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('TC-2654: renders nothing when hasTies is false (non-admin)', () => {
    const { container } = render(
      <TieWarningBanner hasTies={false} isAdmin={false} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('TC-2655: renders admin message when hasTies is true and isAdmin is true', () => {
    render(<TieWarningBanner hasTies={true} isAdmin={true} />);

    // useTranslations returns the i18n key — admin branch uses "tiedRanksWarningAdmin"
    expect(screen.getByText('tiedRanksWarningAdmin')).toBeInTheDocument();
    expect(screen.queryByText('tiedRanksWarningViewer')).toBeNull();
  });

  it('TC-2656: renders viewer message when hasTies is true and isAdmin is false', () => {
    render(<TieWarningBanner hasTies={true} isAdmin={false} />);

    // useTranslations returns the i18n key — non-admin branch uses "tiedRanksWarningViewer"
    expect(screen.getByText('tiedRanksWarningViewer')).toBeInTheDocument();
    expect(screen.queryByText('tiedRanksWarningAdmin')).toBeNull();
  });
});
