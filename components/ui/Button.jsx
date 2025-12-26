'use client';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  className = ''
}) {
  const baseStyles = 'font-medium rounded-lg transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/20',
    secondary: 'glass hover:bg-dark-700 text-dark-100',
    danger: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20',
    ghost: 'hover:bg-dark-800 text-dark-200'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}
