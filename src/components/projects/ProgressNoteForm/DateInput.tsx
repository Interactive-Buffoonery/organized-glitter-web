import React from 'react';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface DateInputProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  error?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ value, disabled, onChange, error }) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="note-date">Date</Label>
      <DateField
        id="note-date"
        value={value}
        onChange={onChange}
        calendarLabel="progress note date"
        className="w-full"
        inputClassName={cn(error && 'border-red-500')}
        disabled={disabled}
        required
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'date-error' : undefined}
      />
      {error && (
        <p id="date-error" className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
};
