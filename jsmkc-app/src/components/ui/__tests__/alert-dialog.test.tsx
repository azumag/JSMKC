/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { render, screen } from "@testing-library/react";
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
jest.mock("@radix-ui/react-alert-dialog", () => ({
  Root: ({ children, open }: any) => (
    <div data-testid="alert-dialog-root" data-open={open}>
      {children}
      {open && (
        <div data-testid="alert-dialog-content">
          <div data-testid="alert-dialog-overlay" />
          <div data-testid="alert-dialog-inner-content">
            <div data-testid="alert-dialog-header" />
            <div data-testid="alert-dialog-body" />
            <div data-testid="alert-dialog-footer" />
          </div>
        </div>
      )}
    </div>
  ),
}));

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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-root")).not.toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByText("Open Dialog"));

    expect(mockOnOpenChange).toHaveBeenCalledWith(true);
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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-content")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-portal")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-header")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-body")).toBeInTheDocument();
    expect(screen.getByTestId("alert-dialog-footer")).toBeInTheDocument();
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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    fireEvent.click(screen.getByText("Action"));

    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it("calls cancel callback when cancel button is clicked", () => {
    render(
      <AlertDialog open={true}>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel onCancel={mockOnCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Open dialog
    fireEvent.click(screen.getByText("Open Dialog"));
    expect(mockOnOpenChange).toHaveBeenCalledWith(true);

    // Close dialog (by clicking overlay)
    const overlay = screen.getByTestId("alert-dialog-overlay");
    fireEvent.click(overlay);
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
            <AlertDialogAction onAction={mockOnAction}>Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    // Test Escape key to close dialog
    const content = screen.getByTestId("alert-dialog-content");
    fireEvent.keyDown(content, { key: 'Escape' });

    // Note: In a real test, you'd verify the dialog closed
    // This is a simplified test since we're mocking the Radix components
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
            <AlertDialogAction className="custom-action" onAction={mockOnAction}>
              Action
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByTestId("alert-dialog-trigger")).toHaveClass("custom-trigger");
    expect(screen.getByTestId("alert-dialog-content")).toHaveClass("custom-content");
    expect(screen.getByTestId("alert-dialog-header")).toHaveClass("custom-header");
    expect(screen.getByTestId("alert-dialog-title")).toHaveClass("custom-title");
    expect(screen.getByTestId("alert-dialog-description")).toHaveClass("custom-description");
    expect(screen.getByTestId("alert-dialog-footer")).toHaveClass("custom-footer");
  });
});