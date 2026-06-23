/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { OverlayToastStack } from "@/components/overlay/overlay-toast-stack";
import type { OverlayEvent } from "@/lib/overlay/types";

jest.mock("@/components/overlay/overlay-toast", () => ({
  OverlayToast: ({ event, leaving }: { event: OverlayEvent; leaving: boolean }) => (
    <div
      data-testid="overlay-toast"
      data-event-id={event.id}
      data-leaving={String(leaving)}
    >
      {event.title}
    </div>
  ),
}));

function makeEvent(id: string, title: string): OverlayEvent {
  return {
    id,
    type: "score_reported",
    timestamp: "2026-06-23T00:00:00.000Z",
    title,
  };
}

describe("OverlayToastStack", () => {
  it("TC-2675: renders with data-testid overlay-toast-stack", () => {
    render(<OverlayToastStack events={[]} leaving={new Set()} />);
    expect(screen.getByTestId("overlay-toast-stack")).toBeInTheDocument();
  });

  it("TC-2676: renders nothing when events array is empty", () => {
    render(<OverlayToastStack events={[]} leaving={new Set()} />);
    expect(screen.queryByTestId("overlay-toast")).toBeNull();
  });

  it("TC-2677: renders one OverlayToast per event with correct event id", () => {
    const events = [makeEvent("evt-1", "Event A"), makeEvent("evt-2", "Event B")];
    render(<OverlayToastStack events={events} leaving={new Set()} />);
    const toasts = screen.getAllByTestId("overlay-toast");
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toHaveAttribute("data-event-id", "evt-1");
    expect(toasts[1]).toHaveAttribute("data-event-id", "evt-2");
  });

  it("TC-2678: passes leaving=true only for events in the leaving set", () => {
    const events = [makeEvent("evt-1", "A"), makeEvent("evt-2", "B"), makeEvent("evt-3", "C")];
    render(<OverlayToastStack events={events} leaving={new Set(["evt-2"])} />);
    const toasts = screen.getAllByTestId("overlay-toast");
    expect(toasts[0]).toHaveAttribute("data-leaving", "false");
    expect(toasts[1]).toHaveAttribute("data-leaving", "true");
    expect(toasts[2]).toHaveAttribute("data-leaving", "false");
  });

  it("TC-2679: uses flex-col-reverse so newest event appears at the top visually", () => {
    render(<OverlayToastStack events={[makeEvent("e1", "A")]} leaving={new Set()} />);
    const stack = screen.getByTestId("overlay-toast-stack");
    expect(stack).toHaveClass("flex-col-reverse");
  });

  it("TC-2680: is fixed-positioned with pointer-events-none for OBS overlay use", () => {
    render(<OverlayToastStack events={[]} leaving={new Set()} />);
    const stack = screen.getByTestId("overlay-toast-stack");
    expect(stack).toHaveClass("fixed");
    expect(stack).toHaveClass("pointer-events-none");
  });
});
