"use client";

import React, { ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export function ErrorFallback({ error, resetError }: { error: Error | null; resetError?: () => void }) {
  // Determine if error is recoverable (network/data errors vs. programming errors)
  const isRecoverable = 
    error?.message?.includes("fetch") ||
    error?.message?.includes("network") ||
    error?.message?.includes("timeout");

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
        <CardDescription className="text-base">
          {getErrorMessage()}
        </CardDescription>
        
        <Alert variant="destructive">
          <AlertDescription className="font-mono text-xs mt-2">
            {error?.message || "No error message available"}
          </AlertDescription>
        </Alert>

        <div className="flex gap-2 pt-4">
          {isRecoverable && resetError && (
            <Button onClick={resetError} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
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

// Class-based Error Boundary using React's Error Boundary API
// This prevents creating components during render by keeping JSX outside render method
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): { hasError: true; error: Error } {
    // Update state so next render will show fallback UI
    // Include error in derived state to ensure error is set synchronously
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Catch errors in any components below and re-render with error message
    this.setState({ error });
    
    // Log error for debugging and analytics
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    // Reset error state to allow user to retry
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI if error occurred
      return (
        this.props.fallback || (
          <ErrorFallback error={this.state.error!} resetError={this.handleReset} />
        )
      );
    }

    // Render children normally if no error
    return this.props.children;
  }
}

export default ErrorBoundary;
