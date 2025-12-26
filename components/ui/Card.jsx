'use client';

export default function Card({ children, className = '', hover = false }) {
  const hoverClass = hover ? 'card-hover cursor-pointer' : '';

  return (
    <div className={`glass rounded-xl p-6 ${hoverClass} ${className}`}>
      {children}
    </div>
  );
}
