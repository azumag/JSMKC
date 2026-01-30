"use client";

/**
 * ErrorBoundary Component
 *
 * Provides a React Error Boundary for catching and displaying runtime errors
 * in the component tree. This is essential for preventing a single component
 * failure from crashing the entire application.
 *
 * React Error Boundaries must be class components because the lifecycle
 * methods getDerivedStateFromError and componentDidCatch are only available
 * on class components (React does not yet provide hook equivalents).
 *
 * Exports:
 *   - ErrorFallback: A presentational component that renders user-friendly
 *     error messages with recovery actions (used as the default fallback UI).
 *   - ErrorBoundary: The class-based error boundary that catches errors in
 *     its child component tree and delegates rendering to a fallback UI.
 *   - default export: ErrorBoundary (for convenience imports).
 */

import React, { ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLogger } from "@/lib/client-logger";

/**
 * Module-level logger instance for the error boundary.
 * Uses client-logger which automatically suppresses output in test mode,
 * preventing noisy logs during unit test execution.
 */
const logger = createLogger({ serviceName: 'error-boundary' });

/**
 * Props for the ErrorBoundary class component.
 *
 * @property children - The child component tree to wrap with error handling.
 * @property fallback - Optional custom fallback UI to render instead of the
 *   default ErrorFallback component when an error is caught.
 * @property onError - Optional callback invoked when an error is caught,
 *   useful for reporting errors to external analytics or monitoring services.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * ErrorFallback - Presentational component for displaying caught errors.
 *
 * Provides context-aware error messages by inspecting the error message
 * string for common keywords (fetch, network, timeout). This heuristic
 * approach gives users actionable guidance without exposing internal details.
 *
 * Recovery behavior:
 *   - "Try Again" button (shown only for recoverable errors): resets the
 *     ErrorBoundary state so the child tree re-renders, which may succeed
 *     if the error was transient (e.g., network timeout).
 *   - "Go Back" button: forces a full page reload as a last-resort recovery.
 *
 * @param error - The caught Error object (may be null if unavailable).
 * @param resetError - Optional callback to reset the ErrorBoundary state,
 *   allowing the wrapped component tree to attempt re-rendering.
 */
export function ErrorFallback({ error, resetError }: { error: Error | null; resetError?: () => void }) {
  /**
   * Determine if the error is likely recoverable (transient) based on
   * keywords in the error message. Network-related errors may resolve
   * on retry, while programming errors (e.g., TypeError) generally will not.
   */
  const isRecoverable =
    error?.message?.includes("fetch") ||
    error?.message?.includes("network") ||
    error?.message?.includes("timeout");

  /**
   * Maps error message content to user-friendly descriptions.
   * Falls back to a generic message if no known pattern matches.
   * This avoids exposing raw error details to end users while still
   * providing useful guidance for common failure scenarios.
   */
  const getErrorMessage = () => {
    if (!error?.message) return "An unexpected error occurred.";
    if (error.message.includes("fetch")) {
      return "Unable to load data. Please refresh the page.";
    }
    if (error.message.includes("network")) {
      return "Connection error. Please check your internet connection.";
    }
    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    return "Something went wrong. Please try again.";
  };

  return (
    <Card className="mx-auto max-w-md border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Error Occurred
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User-friendly error description */}
        <CardDescription className="text-base">
          {getErrorMessage()}
        </CardDescription>

        {/* Technical error details in monospace for debugging */}
        <Alert variant="destructive">
          <AlertDescription className="font-mono text-xs mt-2">
            {error?.message || "No error message available"}
          </AlertDescription>
        </Alert>

        {/* Recovery action buttons */}
        <div className="flex gap-2 pt-4">
          {/*
           * "Try Again" is only shown for recoverable (transient) errors
           * and only when a resetError handler is provided. This prevents
           * users from repeatedly retrying unrecoverable programming errors.
           */}
          {isRecoverable && resetError && (
            <Button onClick={resetError} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
          {/*
           * "Go Back" performs a full page reload as a last-resort recovery
           * mechanism. This clears all client-side state and re-fetches data.
           */}
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
          >
            Go Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ErrorBoundary - Class-based React Error Boundary.
 *
 * React requires error boundaries to be class components because the
 * static getDerivedStateFromError and componentDidCatch lifecycle methods
 * have no hook equivalents. This component catches JavaScript errors
 * anywhere in its child component tree and renders a fallback UI instead
 * of the crashed component tree.
 *
 * State management:
 *   - hasError: boolean flag indicating whether an error has been caught.
 *   - error: the caught Error object, stored for display in the fallback UI.
 *
 * Usage:
 *   <ErrorBoundary onError={reportToSentry}>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 *   // With custom fallback:
 *   <ErrorBoundary fallback={<CustomErrorPage />}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    /** Initialize with no error state */
    this.state = { hasError: false, error: null };
  }

  /**
   * getDerivedStateFromError is called during the render phase when a
   * descendant component throws an error. It must return an object to
   * update state synchronously so the next render shows the fallback UI.
   *
   * The error is stored in state here (rather than only in componentDidCatch)
   * to ensure it is available synchronously for the fallback render pass.
   */
  static getDerivedStateFromError(error: Error): { hasError: true; error: Error } {
    return { hasError: true, error };
  }

  /**
   * componentDidCatch is called during the commit phase after an error
   * has been thrown by a descendant component. This is the appropriate
   * place for side effects like logging and analytics reporting.
   *
   * @param error - The error that was thrown.
   * @param errorInfo - An object containing the componentStack trace,
   *   which shows which component in the tree threw the error.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    /** Update state with the error (belt-and-suspenders with getDerivedStateFromError) */
    this.setState({ error });

    /**
     * Log the error with full context for debugging.
     * client-logger automatically suppresses logs in test mode,
     * so this will not pollute test output.
     */
    logger.error("Error caught by ErrorBoundary", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    } as any);

    /** Invoke the optional external error handler (e.g., Sentry, analytics) */
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Resets the error state, allowing the child tree to attempt re-rendering.
   * This is passed to ErrorFallback as the resetError callback, enabling
   * users to retry after transient errors (e.g., network failures).
   */
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      /**
       * If a custom fallback prop is provided, render it directly.
       * Otherwise, render the default ErrorFallback with the caught error
       * and reset handler for built-in recovery support.
       */
      return (
        this.props.fallback || (
          <ErrorFallback error={this.state.error!} resetError={this.handleReset} />
        )
      );
    }

    /** No error: render the child component tree normally */
    return this.props.children;
  }
}

export default ErrorBoundary;
