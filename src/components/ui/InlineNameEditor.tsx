import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Input, type InputProps } from "./Input";

interface InlineNameEditorProps
  extends Omit<InputProps, "defaultValue" | "onChange" | "onSubmit" | "value"> {
  initialValue?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
  selectAllOnFocus?: boolean;
}

export function InlineNameEditor({
  initialValue = "",
  onSubmit,
  onCancel,
  className,
  selectAllOnFocus = true,
  ...props
}: InlineNameEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ignoreBlurRef = useRef(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (selectAllOnFocus) {
        inputRef.current?.select();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectAllOnFocus]);

  const handleCancel = useCallback(() => {
    if (isSubmitting) return;
    onCancel();
  }, [isSubmitting, onCancel]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue.trim()) {
      onCancel();
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(trimmed);
    } catch {
      setIsSubmitting(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (selectAllOnFocus) {
          inputRef.current?.select();
        }
      });
    }
  }, [initialValue, isSubmitting, onCancel, onSubmit, selectAllOnFocus, value]);

  return (
    <Input
      {...props}
      ref={inputRef}
      value={value}
      disabled={isSubmitting}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => {
        props.onFocus?.(event);
        ignoreBlurRef.current = false;
        if (selectAllOnFocus) {
          event.currentTarget.select();
        }
      }}
      onBlur={(event) => {
        props.onBlur?.(event);
        if (ignoreBlurRef.current) {
          ignoreBlurRef.current = false;
          return;
        }
        void handleSubmit();
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented) return;

        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void handleSubmit();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          ignoreBlurRef.current = true;
          handleCancel();
        }
      }}
      className={cn(
        "h-8 rounded-md border-border bg-bg px-2.5 py-1.5 text-sm font-medium text-text shadow-none",
        className
      )}
    />
  );
}
