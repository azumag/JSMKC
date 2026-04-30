interface TaPhaseSubmitResponse {
  status: number;
  body?: {
    data?: {
      tieBreakRequired?: boolean;
    };
  };
}

export function assertTaPhaseSubmitAccepted(
  response: TaPhaseSubmitResponse,
  label: string,
): void {
  if (response.status !== 200) {
    throw new Error(`${label} HTTP ${response.status}: ${JSON.stringify(response.body).slice(0, 220)}`);
  }

  if (response.body?.data?.tieBreakRequired) {
    throw new Error(`${label} unexpected tie: ${JSON.stringify(response.body).slice(0, 220)}`);
  }
}
