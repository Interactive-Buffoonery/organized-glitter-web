import { useEffect, useRef, useState } from 'react';

interface UseScrollRevealProps {
  threshold?: number;
  rootMargin?: string;
  skip?: boolean;
}

/**
 * Returns a ref + visibility flag that flips to true when the attached
 * element enters the viewport. Used to drive entry animations (fade-in,
 * slide-up) on long pages, not to defer data or code loading - the
 * components are still imported eagerly.
 *
 * Pass `skip: true` to opt the consumer out of the observer (e.g. on
 * reduced-motion or hydration paths) and have it report visible
 * immediately.
 */
export const useScrollReveal = ({
  threshold = 0.1,
  rootMargin = '100px',
  skip = false,
}: UseScrollRevealProps = {}) => {
  const [isVisible, setIsVisible] = useState(skip);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(skip);
  }, [skip]);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (element) {
            observer.unobserve(element);
          }
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [isVisible, rootMargin, threshold]);

  return { ref, isVisible };
};
