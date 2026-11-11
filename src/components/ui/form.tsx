"use client";

import { createContext, forwardRef, useContext, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type FieldContextValue = {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = htmlFor ?? `${generatedId}-control`;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const hasError = Boolean(error);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[13px] font-medium text-slate-700" htmlFor={controlId}>
        {label}
        {required ? (
          <>
            <span aria-hidden className="ml-0.5 text-red-500">
              *
            </span>
            <span className="sr-only"> (wajib)</span>
          </>
        ) : null}
      </label>
      <FieldContext.Provider
        value={{
          controlId,
          describedBy: hasError ? errorId : hint ? hintId : undefined,
          invalid: hasError,
        }}
      >
        {children}
      </FieldContext.Provider>
      {hasError ? (
        <p className="text-[12px] text-red-600" id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-slate-500" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function useFieldProps() {
  return useContext(FieldContext);
}

const controlClasses =
  "block w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const invalidClasses =
  "border-red-300 focus:border-red-500 focus:ring-red-500/20";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", invalid = false, id, "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  const field = useFieldProps();
  const isInvalid = invalid || Boolean(field?.invalid);
  const describedByIds = [describedBy, field?.describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <input
      ref={ref}
      aria-describedby={describedByIds}
      aria-invalid={isInvalid ? true : ariaInvalid}
      className={`${controlClasses} h-9 ${isInvalid ? invalidClasses : ""} ${className}`}
      id={id ?? field?.controlId}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", invalid = false, id, "aria-describedby": describedBy, "aria-invalid": ariaInvalid, children, ...props },
  ref,
) {
  const field = useFieldProps();
  const isInvalid = invalid || Boolean(field?.invalid);
  const describedByIds = [describedBy, field?.describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <select
      ref={ref}
      aria-describedby={describedByIds}
      aria-invalid={isInvalid ? true : ariaInvalid}
      className={`${controlClasses} h-9 cursor-pointer appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8 ${isInvalid ? invalidClasses : ""} ${className}`}
      id={id ?? field?.controlId}
      {...props}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = "", invalid = false, id, "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  const field = useFieldProps();
  const isInvalid = invalid || Boolean(field?.invalid);
  const describedByIds = [describedBy, field?.describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <textarea
      ref={ref}
      aria-describedby={describedByIds}
      aria-invalid={isInvalid ? true : ariaInvalid}
      className={`${controlClasses} min-h-20 py-2 ${isInvalid ? invalidClasses : ""} ${className}`}
      id={id ?? field?.controlId}
      {...props}
    />
  );
});

/** Search box with an inline magnifier; used in table toolbars. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Cari…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <Input
        aria-label={placeholder}
        className="pl-8"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  );
}
