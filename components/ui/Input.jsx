'use client';

export default function Input({
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  label,
  error,
  helpText,
  required = false,
  className = ''
}) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-dark-200">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        className={`w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all ${className}`}
      />
      {helpText && (
        <p className="text-xs text-dark-500">{helpText}</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
