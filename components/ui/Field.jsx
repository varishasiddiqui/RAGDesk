"use client";

import { useId } from "react";

export default function Field({
  label,
  type = "text",
  hint,
  error,
  rightSlot,
  ...rest
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <div className="field__label-row">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {rightSlot}
      </div>
      <input
        id={id}
        type={type}
        className={`field__input ${error ? "field__input--error" : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
