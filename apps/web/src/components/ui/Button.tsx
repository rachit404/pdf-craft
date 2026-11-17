import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl border font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover",
        secondary: "border-line-strong bg-surface text-fg hover:bg-hover",
        ghost: "border-transparent bg-transparent text-fg hover:bg-hover",
        danger: "border-line-strong bg-surface text-danger hover:bg-hover",
      },
      size: {
        sm: "h-7 px-2.5 text-[0.8rem]",
        md: "h-8 px-3 text-[0.85rem]",
        lg: "h-9 px-4 text-[0.9rem]",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export default function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
