export type ParticipantScoreEntryAccessState =
  | "loading"
  | "player"
  | "admin-blocked"
  | "login-required";

interface ParticipantScoreEntryAccessOptions {
  sessionStatus: string;
  userType?: string | null;
  role?: string | null;
}

export function getParticipantScoreEntryAccessState({
  sessionStatus,
  userType,
  role,
}: ParticipantScoreEntryAccessOptions): ParticipantScoreEntryAccessState {
  if (sessionStatus === "loading") {
    return "loading";
  }

  if (userType === "player") {
    return "player";
  }

  if (role === "admin") {
    return "admin-blocked";
  }

  return "login-required";
}
