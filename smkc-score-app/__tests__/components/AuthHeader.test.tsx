/**
 * @jest-environment jsdom
 *
 * Unit tests for the AuthHeader component (TC-2696 through TC-2702).
 *
 * AuthHeader renders three distinct UI states based on useSession():
 *   - loading: animate-pulse skeleton (prevents stale state flash)
 *   - authenticated player: nickname + signOut button
 *   - authenticated admin: name/email + signOut button
 *   - unauthenticated: login link
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthHeader } from "@/components/AuthHeader";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

import { useSession, signOut } from "next-auth/react";
const mockUseSession = useSession as jest.Mock;
const mockSignOut = signOut as jest.Mock;

describe("AuthHeader", () => {
  it("TC-2696: shows skeleton while session is loading, no interactive elements", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });

    const { container } = render(<AuthHeader />);

    // Loading state must not expose premature auth state (no buttons or links)
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // Skeleton must be aria-hidden so screen readers skip it during load
    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
  });

  it("TC-2697: authenticated player shows nickname as /profile link", () => {
    mockUseSession.mockReturnValue({
      data: { user: { userType: "player", nickname: "TestPlayer" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    const profileLink = screen.getByRole("link", { name: "TestPlayer" });
    expect(profileLink).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("TC-2698: authenticated admin shows name and sign-out button", () => {
    mockUseSession.mockReturnValue({
      data: { user: { userType: "admin", name: "Admin User", email: "admin@example.com" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    const profileLink = screen.getByRole("link", { name: "Admin User" });
    expect(profileLink).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("TC-2699: admin with null name falls back to email", () => {
    mockUseSession.mockReturnValue({
      data: { user: { userType: "admin", name: null, email: "fallback@example.com" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    expect(screen.getByRole("link", { name: "fallback@example.com" })).toBeInTheDocument();
  });

  it("TC-2700: unauthenticated shows login link, no sign-out button", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(<AuthHeader />);

    const loginLink = screen.getByRole("link", { name: "Login" });
    expect(loginLink).toHaveAttribute("href", "/auth/signin");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("TC-2701: sign-out button calls signOut with callbackUrl='/'", () => {
    mockUseSession.mockReturnValue({
      data: { user: { userType: "player", nickname: "TestPlayer" } },
      status: "authenticated",
    });

    render(<AuthHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("TC-2702: admin with empty-string name falls back to email", () => {
    // Discord displayName can be empty string (falsy), which should fall through to email
    mockUseSession.mockReturnValue({
      data: { user: { userType: "admin", name: "", email: "empty-name@example.com" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    expect(screen.getByRole("link", { name: "empty-name@example.com" })).toBeInTheDocument();
  });

  it("TC-2703: player with null nickname falls back to email", () => {
    // nickname may be null for players who haven't set one yet
    mockUseSession.mockReturnValue({
      data: { user: { userType: "player", nickname: null, email: "player@example.com" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    expect(screen.getByRole("link", { name: "player@example.com" })).toBeInTheDocument();
  });

  it("TC-2704: player with empty-string nickname falls back to email", () => {
    // nickname can be stored as empty string; ensure falsy fallback to email works
    mockUseSession.mockReturnValue({
      data: { user: { userType: "player", nickname: "", email: "empty-nick@example.com" } },
      status: "authenticated",
    });

    render(<AuthHeader />);

    expect(screen.getByRole("link", { name: "empty-nick@example.com" })).toBeInTheDocument();
  });
});
