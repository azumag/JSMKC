'use client';

import { useTranslations } from 'next-intl';
import type { TaMode } from '@/lib/ta/phase-api-types';
import { cn } from '@/lib/utils';

interface TaModeSelectorProps {
  value: TaMode;
  onValueChange: (value: TaMode) => void;
  disabled?: boolean;
}

export function TaModeSelector({ value, onValueChange, disabled }: TaModeSelectorProps) {
  const t = useTranslations('tournaments');
  const options: Array<{ value: TaMode; title: string; description: string; rules: string[] }> = [
    {
      value: 'standard',
      title: t('standardTaModeTitle'),
      description: t('standardTaModeDescription'),
      rules: [t('standardTaRuleFlow'), t('standardTaRuleLives'), t('standardTaRuleReset'), t('standardTaRuleHandicap')],
    },
    {
      value: 'battle_royale',
      title: t('battleRoyaleModeTitle'),
      description: t('battleRoyaleModeDescription'),
      rules: [
        t('battleRoyaleRuleAllPhase3'),
        t('battleRoyaleRuleLives'),
        t('battleRoyaleRuleHandicap'),
        t('battleRoyaleRuleLocked'),
      ],
    },
  ];

  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2" aria-label={t('taModeSectionTitle')}>
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'cursor-pointer rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary/40',
              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="taMode"
                value={option.value}
                checked={checked}
                onChange={() => onValueChange(option.value)}
                className="mt-1"
              />
              <span className="grid gap-1">
                <span className="font-semibold">{option.title}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {option.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
