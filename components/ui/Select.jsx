'use client';

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  error,
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
      <select
        value={value}
        onChange={onChange}
        required={required}
        className={`w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all ${className}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
