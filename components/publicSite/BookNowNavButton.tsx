"use client";

import {
  useTransition,
  type ComponentPropsWithoutRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = Omit<ComponentPropsWithoutRef<"button">, "onClick" | "type"> & {
  href: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Navigates to the booking page with a visible loading state (avoids “dead” primary CTAs on slow loads).
 */
export function BookNowNavButton({
  href,
  className,
  style,
  children,
  disabled,
  onClick,
  ...rest
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        startTransition(() => {
          router.push(href);
        });
      }}
      className={className}
      style={style}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          <span>טוען…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
