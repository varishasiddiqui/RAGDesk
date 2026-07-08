"use client";

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}) {
  return (
    <button className={`btn btn--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
