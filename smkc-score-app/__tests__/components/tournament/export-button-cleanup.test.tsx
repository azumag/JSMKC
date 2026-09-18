/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportButton } from "@/components/tournament/export-button";

jest.mock("@/lib/client-logger", () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

const loggerFactory = jest.requireMock("@/lib/client-logger")
  .createLogger as jest.Mock;
const mockLogger = loggerFactory.mock.results[0].value;

describe("ExportButton download cleanup", () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => "blob:cdm-export");
    window.URL.revokeObjectURL = jest.fn();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("cleans up after a browser click failure", async () => {
    const workbook = new Blob(["workbook"], {
      type: "application/vnd.ms-excel.sheet.macroEnabled.12",
    });
    const response = new Response(workbook, { status: 200 });
    global.fetch = jest.fn().mockResolvedValue(response);

    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click");
    clickSpy.mockImplementation(() => {
      throw new Error("synthetic click failure");
    });

    render(
      <ExportButton
        tournamentId="tournament-1"
        tournamentName="Grand Prix"
        format="cdm"
      >
        CDM Export
      </ExportButton>,
    );

    const button = screen.getByRole("button", { name: /CDM Export/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to export tournament: synthetic click failure",
      );
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "false");
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Export failed",
      expect.objectContaining({ message: "synthetic click failure" }),
    );
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:cdm-export");
    expect(document.querySelector("a[download]")).not.toBeInTheDocument();
  });
});
