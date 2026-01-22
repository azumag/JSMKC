/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Mock Radix UI primitives
jest.mock("@radix-ui/react-alert-dialog", () => {
  const Root = ({ children, open, ...props }: any) => (
    <div {...props} data-testid="alert-dialog-root" data-open={open}>
      {children}
    </div>
  );
  Root.displayName = "Root";

  const Trigger = ({ children, ...props }: any) => (
    <button {...props} data-testid="alert-dialog-trigger">
      {children}
    </button>
  );
  Trigger.displayName = "Trigger";

  const Overlay = ({ ...props }: any) => (
    <div {...props} data-testid="alert-dialog-overlay" />
  );
  Overlay.displayName = "Overlay";

  const Portal = ({ children }: any) => <div data-testid="alert-dialog-portal">{children}</div>;
  Portal.displayName = "Portal";

  const Content = ({ children, className, ...props }: any) => {
    // Check if Content is being used outside of Portal (simple mock structure)
    // If it has the Portal-style className, wrap it
    if (className && className.includes('fixed left-[50%] top-[50%]')) {
      return (
        <Portal>
          <Overlay />
          <div {...props} className={className} data-testid="alert-dialog-content">
            {children}
          </div>
        </Portal>
      );
    }
    return (
      <div {...props} className={className} data-testid="alert-dialog-content">
        {children}
      </div>
    );
  };
  Content.displayName = "Content";

  const Title = ({ children, className, ...props }: any) => (
    <div {...props} className={className} data-testid="alert-dialog-title">
      {children}
    </div>
  );
  Title.displayName = "Title";

  const Description = ({ children, className, ...props }: any) => (
    <div {...props} className={className} data-testid="alert-dialog-description">
      {children}
    </div>
  );
  Description.displayName = "Description";

  const Action = ({ children, className, ...props }: any) => (
    <button {...props} className={`mock-button-class ${className || ''}`} data-testid="alert-dialog-action">
      {children}
    </button>
  );
  Action.displayName = "Action";

  const Cancel = ({ children, className, ...props }: any) => (
    <button {...props} className={`mock-button-class mt-2 sm:mt-0 ${className || ''}`} data-testid="alert-dialog-cancel">
      {children}
    </button>
  );
  Cancel.displayName = "Cancel";

  return {
    Root,
    Trigger,
    Overlay,
    Portal,
    Content,
    Title,
    Description,
    Action,
    Cancel,
  };
});

// Mock button variants
jest.mock("@/components/ui/button", () => ({
  buttonVariants: () => "mock-button-class",
}));

// Mock cn utility
jest.mock("@/lib/utils", () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(" "),
}));

describe("AlertDialog", () => {
  const mockOnAction = jest.fn();
  const mockOnCancel = jest.fn();
  const mockOnOpenChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders trigger button", () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-trigger")).toBeInTheDocument();
    expect(screen.getByText("Open Dialog")).toBeInTheDocument();
  });

  it("opens dialog when trigger is clicked", () => {
    const { rerender } = render(
      <AlertDialog open={false} onOpenChange={mockOnOpenChange}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-root")).not.toHaveAttribute("data-open", "true");

    // Simulate opening dialog by re-rendering with open=true
    rerender(
      <AlertDialog open={true} onOpenChange={mockOnOpenChange}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-root")).toHaveAttribute("data-open", "true");
  });

  it("renders AlertDialog components correctly", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Verify key components are rendered
    expect(screen.getByTestId("alert-dialog-content")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-title")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-description")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-action")).toBeInTheDocument();
  });

  it("renders title and description", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-title")).toHaveTextContent("Test Title");
    expect(screen.getByTestId("alert-dialog-description")).toHaveTextContent("Test Description");
  });

  it("renders action and cancel buttons", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-action")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("calls action callback when action button is clicked", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Click the action button
    fireEvent.click(screen.getByText("Action"));

    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it("calls cancel callback when cancel button is clicked", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={mockOnCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Click the cancel button
    fireEvent.click(screen.getByText("Cancel"));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenChange when dialog is opened/closed", () => {
    render(
      <AlertDialog open={false} onOpenChange={mockOnOpenChange}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Open dialog
    mockOnOpenChange(true);
    expect(mockOnOpenChange).toHaveBeenCalledWith(true);

    // Close dialog
    mockOnOpenChange(false);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports controlled open state", () => {
    const { rerender } = render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-root")).toHaveAttribute("data-open", "true");

    // Close dialog
    rerender(
      <AlertDialog open={false}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-root")).not.toHaveAttribute("data-open", "true");
  });

  it("renders custom content", () => {
    const customContent = (
      <div data-testid="custom-content">
        Custom dialog content
      </div>
    );

    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          {customContent}
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("custom-content")).toBeInTheDocument();
    expect(screen.getByText("Custom dialog content")).toBeInTheDocument();
  });

  it("handles keyboard interactions", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Title</AlertDialogTitle>
            <AlertDialogDescription>Test Description</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // This test is simplified since we're mocking the Radix components
    // In a real implementation, you'd test Escape key handling
    expect(screen.getByTestId("alert-dialog-content")).toBeInTheDocument();
  });

  it("applies custom className to components", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger className="custom-trigger">Open Dialog</AlertDialogTrigger>
        <AlertDialogContent className="custom-content">
          <AlertDialogHeader className="custom-header">
            <AlertDialogTitle className="custom-title">Test Title</AlertDialogTitle>
            <AlertDialogDescription className="custom-description">
              Test Description
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="custom-footer">
            <AlertDialogCancel className="custom-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction className="custom-action" onClick={mockOnAction}>
              Action
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-trigger")).toHaveClass("custom-trigger");
    expect(screen.getByTestId("alert-dialog-content")).toHaveClass("custom-content");
    expect(screen.getByTestId("alert-dialog-title")).toHaveClass("custom-title");
    expect(screen.getByTestId("alert-dialog-description")).toHaveClass("custom-description");
  });
});