/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportButton } from "@/components/tournament/export-button";

const mockLoggerError = jest.fn();

jest.mock("@/lib/client-logger", () => ({
  createLogger: jest.fn(() => ({
    error: mockLoggerError,
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe("ExportButton download cleanup", () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => "blob:cdm-export");
    window.URL.revokeObjectURL = jest.fn();
    mockLoggerError.mockClear();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it(
    "releases the temporary anchor and object URL when the browser click fails",
    async () => {
      const workbook = new Blob(["workbook"], {
        type: "application/vnd.ms-excel.sheet.macroEnabled.12",
      });
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response(workbook, { status: 200 }));
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {
          throw new Error("synthetic click failure");
        });
      const originalCreateElement = document.createElement.bind(document);
      const anchors: HTMLAnchorElement[] = [];
      jest
        .spyOn(document, "createElement")
        .mockImplementation(
          ((tagName: string, options?: ElementCreationOptions) => {
            const element = originalCreateElement(tagName, options);
            if (tagName.toLowerCase() === "a") {
              anchors.push(element as HTMLAnchorElement);
            }
            return element;
          }) as typeof document.createElement,
        );

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
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Export failed",
        expect.objectContaining({ message: "synthetic click failure" }),
      );
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:cdm-export");
      expect(anchors).toHaveLength(1);
      expect(document.body.contains(anchors[0])).toBe(false);
    },
  );
});
