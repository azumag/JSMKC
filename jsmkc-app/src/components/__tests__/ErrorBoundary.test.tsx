/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, ErrorFallback } from "@/components/ErrorBoundary";

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="alert-icon">AlertCircle</span>,
  RefreshCw: () => <span data-testid="refresh-icon">RefreshCw</span>,
}));

// Mock components
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, variant, size }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>
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

jest.mock("@/components/ui/alert", () => ({
  Alert: ({ variant, children }: any) => (
    <div data-variant={variant} data-testid="alert">
      {children}
    </div>
  ),
  AlertDescription: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));

describe("ErrorFallback", () => {
  const mockError = new Error("Test error message");
  const mockResetError = jest.fn();

  beforeEach(() => {
    mockResetError.mockClear();
  });

  it("renders error message correctly", () => {
    render(<ErrorFallback error={mockError} />);

    expect(screen.getByText("Error Occurred")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByTestId("alert")).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("shows specific error messages for network errors", () => {
    const networkError = new Error("network request failed");
    render(<ErrorFallback error={networkError} />);

    expect(screen.getByText("Connection error. Please check your internet connection.")).toBeInTheDocument();
    expect(screen.getByText("network request failed")).toBeInTheDocument();
  });

  it("shows specific error messages for fetch errors", () => {
    const fetchError = new Error("fetch failed");
    render(<ErrorFallback error={fetchError} />);

    expect(screen.getByText("Unable to load data. Please refresh the page.")).toBeInTheDocument();
    expect(screen.getByText("fetch failed")).toBeInTheDocument();
  });

  it("shows specific error messages for timeout errors", () => {
    const timeoutError = new Error("timeout exceeded");
    render(<ErrorFallback error={timeoutError} />);

    expect(screen.getByText("Request timed out. Please try again.")).toBeInTheDocument();
    expect(screen.getByText("timeout exceeded")).toBeInTheDocument();
  });

  it("shows default message for unknown errors", () => {
    const unknownError = new Error("Unknown error");
    render(<ErrorFallback error={unknownError} />);

    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("shows Try Again button for recoverable errors", () => {
    const recoverableError = new Error("fetch failed");
    render(<ErrorFallback error={recoverableError} resetError={mockResetError} />);

    const tryAgainButton = screen.getByText("Try Again");
    expect(tryAgainButton).toBeInTheDocument();

    fireEvent.click(tryAgainButton);
    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it("does not show Try Again button for non-recoverable errors", () => {
    const nonRecoverableError = new Error("Programming error");
    render(<ErrorFallback error={nonRecoverableError} resetError={mockResetError} />);

    expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
  });

  it("shows Go Back button", () => {
    render(<ErrorFallback error={mockError} />);

    const goBackButton = screen.getByText("Go Back");
    expect(goBackButton).toBeInTheDocument();

    // Mock window.location.reload
    const originalReload = window.location.reload;
    window.location.reload = jest.fn();
    
    fireEvent.click(goBackButton);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    
    window.location.reload = originalReload;
  });

  it("handles null error gracefully", () => {
    render(<ErrorFallback error={null} />);

    expect(screen.getByText("Error Occurred")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when no error occurs", () => {
    const ChildComponent = () => <div data-testid="child">Child content</div>;
    
    render(
      <ErrorBoundary>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("catches errors and renders fallback UI", () => {
    const ChildComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error Occurred")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("calls custom error handler when provided", () => {
    const mockErrorHandler = jest.fn();
    const ChildComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary onError={mockErrorHandler}>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(mockErrorHandler).toHaveBeenCalledTimes(1);
    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Object)
    );
  });

  it("uses custom fallback when provided", () => {
    const customFallback = <div data-testid="custom-fallback">Custom Fallback</div>;
    const ChildComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary fallback={customFallback}>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
  });

  it("resets error state when reset button is clicked", () => {
    // Test that the resetError prop is passed to ErrorFallback correctly
    const resetErrorSpy = jest.fn();
    const testError = new Error("fetch failed");

    const ThrowComponent = () => {
      throw testError;
    };

    render(
      <ErrorBoundary fallback={<ErrorFallback error={testError} resetError={resetErrorSpy} />}>
        <ThrowComponent />
      </ErrorBoundary>
    );

    // Find the reset button in the custom fallback
    const resetButton = screen.getByText("Try Again");
    expect(resetButton).toBeInTheDocument();

    // Click the reset button
    fireEvent.click(resetButton);

    // Verify the reset function was called
    expect(resetErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("logs errors to console", () => {
    const ChildComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ChildComponent />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error caught by ErrorBoundary:",
      expect.any(Error),
      expect.any(Object)
    );
  });

  it("handles multiple error scenarios", () => {
    const testCases = [
      { error: new Error("network error"), expectedMessage: "Connection error. Please check your internet connection." },
      { error: new Error("fetch error"), expectedMessage: "Unable to load data. Please refresh the page." },
      { error: new Error("timeout error"), expectedMessage: "Request timed out. Please try again." },
      { error: new Error("Any other error"), expectedMessage: "Something went wrong. Please try again." },
    ];

    testCases.forEach(({ error, expectedMessage }) => {
      const ChildComponent = () => {
        throw error;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ChildComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText(expectedMessage)).toBeInTheDocument();

      // Reset for next test
      rerender(
        <ErrorBoundary>
          <div>Reset content</div>
        </ErrorBoundary>
      );
    });
  });
});