import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("TournamentTokenManager - Basic Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset clipboard mock to default implementation
    (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
  });

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
});