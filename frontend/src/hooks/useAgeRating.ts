import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'age-rating';
const EVENT = 'age-rating-change';

export type AgeRating = 'all' | 'adult';

export function getAgeRating(): AgeRating {
  return (localStorage.getItem(STORAGE_KEY) as AgeRating) || 'all';
}

export function setAgeRating(value: AgeRating) {
  localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useAgeRating(): [AgeRating, (v: AgeRating) => void] {
  const [rating, setRating] = useState<AgeRating>(getAgeRating);

  useEffect(() => {
    const handler = () => setRating(getAgeRating());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const update = useCallback((v: AgeRating) => {
    setAgeRating(v);
  }, []);

  return [rating, update];
}
