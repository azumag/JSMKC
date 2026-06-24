/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { NavLabelClient } from '@/components/NavLabel';

jest.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `[${ns}:${key}]`,
}));

describe('NavLabelClient', () => {
  it('TC-2995: messageKey を翻訳してレンダリングする', () => {
    render(<NavLabelClient messageKey="nav.home" />);

    expect(screen.getByText('[common:nav.home]')).toBeInTheDocument();
  });
});
