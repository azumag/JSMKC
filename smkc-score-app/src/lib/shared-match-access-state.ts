export type SharedMatchAccessState =
  | "hidden"
  | "unauthorized"
  | "report-form";

interface SharedMatchAccessInput {
  canReport: boolean;
  isSessionLoading: boolean;
  isCompleted: boolean;
  isSubmitted: boolean;
}

export function getSharedMatchAccessState({
  canReport,
  isSessionLoading,
  isCompleted,
  isSubmitted,
}: SharedMatchAccessInput): SharedMatchAccessState {
  if (isCompleted || isSubmitted) {
    return "hidden";
  }

  if (!canReport) {
    return isSessionLoading ? "hidden" : "unauthorized";
  }

  return "report-form";
}
