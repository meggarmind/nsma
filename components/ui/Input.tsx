'use client';

import { type InputHTMLAttributes, useId } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Label text displayed above input */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Help text displayed below input */
  helpText?: string;
  /** Additional className for the input element */
  className?: string;
}

export default function Input({
  type = 'text',
  label,
  error,
  helpText,
  required = false,
  className = '',
  id: providedId,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = providedId || generatedId;
  const helpTextId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  // Build aria-describedby based on what's present
  const describedBy = [
    helpText ? helpTextId : null,
    error ? errorId : null
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-dark-200">
          {label}
          {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {helpText && (
        <p id={helpTextId} className="text-xs text-dark-500">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
