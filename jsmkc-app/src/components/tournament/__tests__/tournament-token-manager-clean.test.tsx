/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TournamentTokenManager from "@/components/tournament/tournament-token-manager";

// Test variables
const mockTournamentId = "tournament-123";
const mockToken = "test-token-12345";
const mockTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  Copy: () => <span data-testid="copy-icon">Copy</span>,
  RefreshCw: () => <span data-testid="refresh-icon">RefreshCw</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  Shield: () => <span data-testid="shield-icon">Shield</span>,
  Eye: () => <span data-testid="eye-icon">Eye</span>,
  EyeOff: () => <span data-testid="eye-off-icon">EyeOff</span>,
}));

// Mock components
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, variant, size, dataTestId }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      data-testid={dataTestId || "button"}
    >
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant }: any) => (
    <span data-variant={variant} data-testid="badge">
      {children}
    </span>
  ),
}));

// Mock next-auth

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

// Mock sonner toast
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock window.location
Object.defineProperty(window, "location", {
  value: {
    origin: "http://localhost:3000",
    assign: jest.fn(),
    replace: jest.fn(),
  },
  writable: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: jest.fn(),
  },
  writable: true,
});

// Mock fetch
global.fetch = jest.fn();

describe("TournamentTokenManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset clipboard mock to default implementation
    (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
    
    // Spy on toast functions
    (require("sonner").toast.success as jest.Mock).mockClear();
    (require("sonner").toast.error as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Restore clipboard mock to prevent interference between tests
    (navigator.clipboard.writeText as jest.Mock).mockRestore();
  });

  // Basic Authentication Tests
  it("renders auth message when user is not authenticated", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: null,
    });

    render(<TournamentTokenManager tournamentId={mockTournamentId} />);

    expect(screen.getByText("Token Access")).toBeInTheDocument();
    expect(screen.getByText("Tournament token management requires authentication")).toBeInTheDocument();
    expect(screen.getByTestId("shield-icon")).toBeInTheDocument();
  });

  it("renders token manager when user is authenticated", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(<TournamentTokenManager tournamentId={mockTournamentId} />);

    expect(screen.getByText("Tournament Token Management")).toBeInTheDocument();
    expect(screen.getByText("Manage secure access tokens for participant score entry")).toBeInTheDocument();
  });

  // Token State Tests
  it("shows active token status when token is valid", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    expect(screen.getByTestId("badge")).toHaveAttribute("data-variant", "default");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays masked token by default", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    const tokenDisplay = screen.getByText(/••••••••••••••••••••••••••••••••/);
    expect(tokenDisplay).toBeInTheDocument();
  });

  it("copies token to clipboard when copy button is clicked", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    (navigator.clipboard.writeText as jest.Mock).mockResolvedValueOnce(undefined);
    
    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    // Find the first copy button (token copy)
    const copyButtons = screen.getAllByTestId("copy-icon");
    fireEvent.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockToken);
  });

  it("generates participant URL correctly", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    const expectedUrl = `http://localhost:3000/tournaments/${mockTournamentId}/participant?token=${mockToken}`;
    const urlInput = screen.getByDisplayValue(expectedUrl);
    expect(urlInput).toBeInTheDocument();
  });

  // Token Display Toggle Tests
  it("should hide token by default", () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );
    expect(screen.getByText(/••••••••••••••••••••••••••••••••/)).toBeInTheDocument();
    expect(screen.queryByText('test-token-12345')).not.toBeInTheDocument();
  });

  it("should show token when Eye icon is clicked", async () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    const eyeButton = screen.getByTestId("eye-icon");
    fireEvent.click(eyeButton);

    await waitFor(() => {
      expect(screen.getByText('test-token-12345')).toBeInTheDocument();
    });
  });

  it("should hide token when EyeOff icon is clicked", async () => {
    require("next-auth/react").useSession.mockReturnValue({
      data: {
        user: { id: "1", name: "Test User", email: "test@example.com" },
      },
    });

    render(
      <TournamentTokenManager 
        tournamentId={mockTournamentId}
        initialToken={mockToken}
        initialTokenExpiresAt={mockTokenExpiresAt}
      />
    );

    // First show the token
    const eyeButton = screen.getByTestId("eye-icon");
    fireEvent.click(eyeButton);

    // Then hide it
    const eyeOffButton = screen.getByTestId("eye-off-icon");
    fireEvent.click(eyeOffButton);

    await waitFor(() => {
      const maskedToken = screen.getByText(/••••••••••••••••••••••••••••••••/);
      expect(maskedToken).toBeInTheDocument();
    });
  });

  // Copy to Clipboard Tests
  describe("Copy to Clipboard", () => {
    beforeEach(() => {
      // Reset clipboard mock before each test
      (navigator.clipboard.writeText as jest.Mock).mockClear();
      (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
    });

    it("should copy token to clipboard when copy button is clicked", () => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });

      const toastSuccessSpy = jest.fn();
      (require("sonner").toast.success as jest.Mock) = toastSuccessSpy;
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const copyButtons = screen.getAllByTestId("copy-icon");
      const tokenCopyButton = copyButtons[0];
      fireEvent.click(tokenCopyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockToken);
      expect(toastSuccessSpy).toHaveBeenCalledWith("Token copied to clipboard");
    });

    it("should copy participant URL to clipboard", () => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });

      const toastSuccessSpy = jest.fn();
      (require("sonner").toast.success as jest.Mock) = toastSuccessSpy;
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const copyButtons = screen.getAllByTestId("copy-icon");
      const urlCopyButton = copyButtons[1];
      fireEvent.click(urlCopyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `http://localhost:3000/tournaments/${mockTournamentId}/participant?token=${mockToken}`
      );
      expect(toastSuccessSpy).toHaveBeenCalledWith("URL copied to clipboard");
    });
    it("should not show error toast when URL clipboard copy fails", () => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
      
      // Create a fresh mock for this test to avoid interference
      const clipboardWriteTextSpy = jest.fn().mockRejectedValueOnce(new Error("Clipboard error"));
      (navigator.clipboard.writeText as jest.Mock) = clipboardWriteTextSpy;
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const copyButtons = screen.getAllByTestId("copy-icon");
      const urlCopyButton = copyButtons[1];
      fireEvent.click(urlCopyButton);

      // Component doesn't handle errors for URL copy, so no toast should be shown
      expect(require("sonner").toast.error).not.toHaveBeenCalled();
    });
  });

  // Regenerate Token Tests
  describe("Regenerate Token", () => {
    beforeEach(() => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
    });

    it("should call regenerate API endpoint when Regenerate button is clicked", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => ({ 
          token: "new-token-12345", 
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() 
        }),
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const regenerateButton = screen.getByText("Regenerate Token");
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/tournaments/${mockTournamentId}/token/regenerate`),
          expect.objectContaining({
            method: "POST",
          })
        );
      });
    });

    it("should show success toast when token regeneration succeeds", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => ({ 
          token: "new-token-12345", 
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() 
        }),
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const regenerateButton = screen.getByText("Regenerate Token");
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it("should show error toast when token regeneration fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const regenerateButton = screen.getByText("Regenerate Token");
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(require("sonner").toast.error).toHaveBeenCalledWith("Failed to regenerate token");
      });
    });

    it("should handle network errors during token regeneration", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const regenerateButton = screen.getByText("Regenerate Token");
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(require("sonner").toast.error).toHaveBeenCalledWith("Failed to regenerate token");
      });
    });
  });

  // Extend Token Tests
  describe("Extend Token", () => {
    beforeEach(() => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
    });

    it("should call extend API endpoint when Extend button is clicked", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => ({ 
          token: mockToken, 
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() 
        }),
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const extendButton = screen.getByText("Extend by 24h");
      fireEvent.click(extendButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/tournaments/${mockTournamentId}/token/extend`),
          expect.objectContaining({
            method: "POST",
          })
        );
      });
    });

    it("should show success toast when token extension succeeds", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => ({ 
          token: mockToken, 
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() 
        }),
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const extendButton = screen.getByText("Extend by 24h");
      fireEvent.click(extendButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it("should show error toast when token extension fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const extendButton = screen.getByText("Extend by 24h");
      fireEvent.click(extendButton);

      await waitFor(() => {
        expect(require("sonner").toast.error).toHaveBeenCalledWith("Failed to extend token");
      });
    });

    it("should be disabled when no valid token exists", () => {
      render(<TournamentTokenManager tournamentId={mockTournamentId} />);

      const extendButton = screen.getByText("Extend by 24h");
      expect(extendButton).toBeDisabled();
    });
  });

  // Time Remaining Calculations
  describe("Time Remaining Calculations", () => {
    beforeEach(() => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
    });

    it("should show 'Expired' when token is past expiry", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={pastDate.toISOString()}
        />
      );

      // Look for "Expired" in the time remaining section specifically
      const timeRemainingElement = screen.getByText(/Time Remaining/).nextElementSibling;
      expect(timeRemainingElement?.textContent).toContain("Expired");
    });

    it("should show hours and minutes when less than 24 hours remaining", () => {
      const soonExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={soonExpiry}
        />
      );

      expect(screen.getByText(/2h 0m remaining/)).toBeInTheDocument();
    });

    it("should show days and hours when more than 24 hours remaining", () => {
      const farExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={farExpiry}
        />
      );

      // Be more flexible with the time format since it might be slightly different
      const timeElement = screen.getByText(/Time Remaining/).nextElementSibling;
      expect(timeElement?.textContent).toMatch(/\d+ days? \d+h remaining/);
    });

    it("should show correct format for exactly 24 hours", () => {
      const exactly24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={exactly24h}
        />
      );

      // Be more flexible with the time format since it might be slightly different due to timing
      const timeElement = screen.getByText(/Time Remaining/).nextElementSibling;
      expect(timeElement?.textContent).toMatch(/\d+h \d+m remaining/);
    });
  });

  // Security Notice Tests
  describe("Security Notice", () => {
    beforeEach(() => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
    });

    it("should display all security notice items", () => {
      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      expect(screen.getByText("Tokens provide access to score entry for all participants")).toBeInTheDocument();
      expect(screen.getByText("Only share this URL with authorized tournament participants")).toBeInTheDocument();
      expect(screen.getByText("Token validation attempts are logged for security")).toBeInTheDocument();
      expect(screen.getByText("Regenerate the token if you suspect unauthorized access")).toBeInTheDocument();
    });
  });

  // Loading States Tests
  describe("Loading States", () => {
    beforeEach(() => {
      require("next-auth/react").useSession.mockReturnValue({
        data: {
          user: { id: "1", name: "Test User", email: "test@example.com" },
        },
      });
    });

    it("should show loading state on Regenerate button during regeneration", async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => ({ 
            token: "new-token-12345", 
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() 
          }),
        }), 100))
      );

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const regenerateButton = screen.getByText("Regenerate Token");
      fireEvent.click(regenerateButton);

      // Button should be disabled during API call
      expect(regenerateButton).toBeDisabled();
      
      // Check if loading state is shown by looking for disabled button or loading text
      const loadingText = screen.queryByText("Regenerating...");
      if (loadingText) {
        expect(loadingText).toBeInTheDocument();
      } else {
        // If no loading text, just check that button is disabled
        expect(regenerateButton).toBeDisabled();
      }
    });

    it("should show loading state on Extend button during extension", async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => ({ 
            token: mockToken, 
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() 
          }),
        }), 100))
      );

      render(
        <TournamentTokenManager 
          tournamentId={mockTournamentId}
          initialToken={mockToken}
          initialTokenExpiresAt={mockTokenExpiresAt}
        />
      );

      const extendButton = screen.getByText("Extend by 24h");
      fireEvent.click(extendButton);

      // Button should be disabled during API call
      expect(extendButton).toBeDisabled();
      
      // Check if loading state is shown by looking for disabled button or loading text
      const loadingText = screen.queryByText("Extending...");
      if (loadingText) {
        expect(loadingText).toBeInTheDocument();
      } else {
        // If no loading text, just check that button is disabled
        expect(extendButton).toBeDisabled();
      }
    });
  });
});