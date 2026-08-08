import { useTranslations } from 'next-intl';

interface SlotEditButtonProps {
  slot: 1 | 2;
  onClick: () => void;
  testId: string;
}

/**
 * Compact pencil button shown next to a bracket slot when slot-edit mode is
 * active. Shared by double-elimination-bracket.tsx and playoff-bracket.tsx.
 */
export function SlotEditButton({ slot, onClick, testId }: SlotEditButtonProps) {
  const tf = useTranslations('finals');
  return (
    <button
      type="button"
      className="opacity-60 hover:opacity-100 text-xs leading-none"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={tf('slotEditButtonLabel', { slot })}
      data-testid={testId}
    >
      ✎
    </button>
  );
}
