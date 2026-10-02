/**
 * Controlled search component with local buffered commits
 * @author @serabi
 * @created 2025-07-09
 */

import React, {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import {
  MIN_PROJECT_SEARCH_LENGTH,
  normalizeProjectSearchTerm,
} from '@/features/dashboard/dashboard.constants';

interface SearchProjectsProps {
  searchTerm: string;
  resetVersion: number;
  onSearchChange: (term: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  isPending?: boolean; // Show loading state during deferred search
}

const SearchProjects = ({
  searchTerm,
  resetVersion,
  onSearchChange,
  inputRef,
  isPending,
}: SearchProjectsProps) => {
  // Local input state to avoid global churn on every keystroke
  const [local, setLocal] = useState(searchTerm || '');
  const lastRequestedTerm = useRef<string | null>(null);
  const previousResetVersion = useRef(resetVersion);
  // Keep local in sync if parent changes searchTerm externally
  useEffect(() => {
    if (resetVersion !== previousResetVersion.current) {
      previousResetVersion.current = resetVersion;
      lastRequestedTerm.current = null;
      setLocal(searchTerm);
      return;
    }
    if (searchTerm === lastRequestedTerm.current) {
      lastRequestedTerm.current = null;
      return;
    }
    setLocal(prev => (prev !== searchTerm ? searchTerm : prev));
  }, [searchTerm, resetVersion]);

  // Defer heavy updates and debounce before committing to global state
  const deferred = useDeferredValue(local);
  const isTooShort = local.trim().length > 0 && local.trim().length < MIN_PROJECT_SEARCH_LENGTH;

  useEffect(() => {
    if (deferred !== local) return;

    const t = setTimeout(() => {
      const nextSearch = normalizeProjectSearchTerm(deferred);
      if (nextSearch !== searchTerm) {
        lastRequestedTerm.current = nextSearch;
        startTransition(() => onSearchChange(nextSearch));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [deferred, local, onSearchChange, searchTerm]);

  const showSpinner = useMemo(() => Boolean(isPending), [isPending]);
  const inputId = useId();
  const helpId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search project titles
      </label>
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <Input
          id={inputId}
          type="text"
          placeholder="Search project titles"
          value={local}
          onChange={e => setLocal(e.target.value)}
          className="bg-background focus:border-primary h-12 w-full border-2 pr-12 pl-12 text-base transition-colors duration-200"
          aria-describedby={helpId}
          ref={inputRef}
        />
        {showSpinner && (
          <div className="absolute top-1/2 right-4 -translate-y-1/2">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        )}
      </div>
      <div id={helpId} className="sr-only">
        Search project titles. Enter at least 2 characters to search. Turn on the extra search
        option to also search notes and source links.
      </div>
      {isTooShort && (
        <p className="text-muted-foreground mt-1 text-sm">Enter at least 2 characters to search.</p>
      )}
    </div>
  );
};

export default React.memo(SearchProjects);
