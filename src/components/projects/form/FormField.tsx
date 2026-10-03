import React from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  id: string;
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}

const FormField = ({ id, label, children, required = false, error }: FormFieldProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive-text ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive-text mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
};

export default FormField;
