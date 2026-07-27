/**
 * @jest-environment jsdom
 *
 * Player feedback (2026-07-27): the password field on the sign-in page has
 * no way to check what was typed, and the default font makes lookalike
 * characters (l/I/1, O/0) hard to distinguish once shown. This covers the
 * show/hide toggle and the legible monospace font applied while visible.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import SignInPage from '@/app/auth/signin/page';

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('Sign-in password field: show/hide toggle', () => {
  it('starts masked with a "showPassword" toggle button', () => {
    render(<SignInPage />);

    const passwordInput = screen.getByLabelText('password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'showPassword' })).toBeInTheDocument();
  });

  it('reveals the password as plain text in a legible monospace font on toggle click', () => {
    render(<SignInPage />);

    const passwordInput = screen.getByLabelText('password');
    fireEvent.change(passwordInput, { target: { value: 'Il1O0' } });
    fireEvent.click(screen.getByRole('button', { name: 'showPassword' }));

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(passwordInput.className).toMatch(/font-mono/);
    // Toggle re-labels itself so the same control hides it again.
    expect(screen.getByRole('button', { name: 'hidePassword' })).toBeInTheDocument();
  });

  it('toggles back to masked, non-monospace on a second click', () => {
    render(<SignInPage />);

    const toggle = () => screen.getByRole('button', { name: /password$/i });
    fireEvent.click(toggle());
    fireEvent.click(toggle());

    const passwordInput = screen.getByLabelText('password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput.className).not.toMatch(/font-mono/);
  });

  it('does not submit the form when the toggle is clicked', () => {
    render(<SignInPage />);

    const toggleButton = screen.getByRole('button', { name: 'showPassword' });
    expect(toggleButton).toHaveAttribute('type', 'button');
  });
});
