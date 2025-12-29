'use client';

import { type HTMLAttributes, type ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Enable hover effect */
  hover?: boolean;
}

export default function Card({
  children,
  className = '',
  hover = false,
  ...props
}: CardProps) {
  const hoverClass = hover ? 'card-hover cursor-pointer' : '';

  return (
    <div
      className={`glass rounded-xl p-6 ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
