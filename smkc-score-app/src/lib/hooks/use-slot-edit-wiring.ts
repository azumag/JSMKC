import { useState } from 'react';

export interface SlotEditTarget<TMatch> {
  match: TMatch;
  slot: 1 | 2;
}

/**
 * Shared wiring for the manual slot-placement adjustment mode used by the
 * BM/MR/GP finals pages (issue #3017): the mode toggle state, the currently
 * selected match+slot, and the click handler that opens the edit dialog.
 * Each page's match type differs (BMMatch/MRMatch/GPBracketMatch), so the
 * dialog JSX itself stays in the pages, but this hook removes the triplicated
 * state declarations and handler.
 */
export function useSlotEditWiring<TMatch>() {
  const [slotEditMode, setSlotEditMode] = useState(false);
  const [slotEditTarget, setSlotEditTarget] = useState<SlotEditTarget<TMatch> | null>(null);
  const handleSlotClick = (match: TMatch, slot: 1 | 2) => setSlotEditTarget({ match, slot });

  return { slotEditMode, setSlotEditMode, slotEditTarget, setSlotEditTarget, handleSlotClick };
}
