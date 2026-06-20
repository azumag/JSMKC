import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type TaTimeInputProps } from "@/lib/ta/time-entry-layout";

type TaParticipantTimeInputRowProps = {
  courseAbbr: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  inputClassName: string;
  timeInputProps: TaTimeInputProps;
  onChange: (course: string, value: string) => void;
  onBlur: (course: string) => void;
};

export const TaParticipantTimeInputRow = memo(function TaParticipantTimeInputRow({
  courseAbbr,
  value,
  placeholder,
  disabled,
  inputClassName,
  timeInputProps,
  onChange,
  onBlur,
}: TaParticipantTimeInputRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-12 text-xs font-mono">{courseAbbr}</Label>
      <Input
        type="text"
        {...timeInputProps}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(courseAbbr, e.target.value)}
        onBlur={() => onBlur(courseAbbr)}
        disabled={disabled}
        className={inputClassName}
      />
    </div>
  );
});
