export type SharedMatchAccessState =
  | "hidden"
  | "unauthorized"
  | "admin-guidance"
  | "report-form";

interface SharedMatchAccessInput {
  canReport: boolean;
  isAdmin: boolean;
  isSessionLoading: boolean;
  isCompleted: boolean;
  isSubmitted: boolean;
}

export function getSharedMatchAccessState({
  canReport,
  isAdmin,
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

  return isAdmin ? "admin-guidance" : "report-form";
}
