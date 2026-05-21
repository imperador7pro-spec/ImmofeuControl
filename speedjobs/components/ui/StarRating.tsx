'use client';

import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
}

export function StarRating({ value, onChange, size = 'md', readOnly = false }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const sizeCls = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  const current = hover || value;
  return (
    <div className={`flex gap-1 ${sizeCls}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange?.(star)}
          className={
            star <= current
              ? 'text-yellow-400 cursor-pointer'
              : 'text-gray-300 cursor-pointer'
          }
        >
          ★
        </button>
      ))}
    </div>
  );
}
