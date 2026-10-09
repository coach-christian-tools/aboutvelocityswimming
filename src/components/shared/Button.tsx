import { forwardRef } from "react";
import { cn } from "@/lib/classes";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
          {
            "bg-accent text-primary-ink hover:bg-accent-hover active:bg-[#065343] shadow-xs":
              variant === "primary",
            "bg-[#13415D] text-white hover:bg-[#0d2e42] active:bg-[#09202f] shadow-xs":
              variant === "secondary",
            "border border-border bg-surface text-text-primary hover:bg-bg hover:border-slate-400 active:bg-slate-100":
              variant === "outline",
            "bg-transparent text-text-primary hover:bg-slate-100 active:bg-slate-200":
              variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-xs":
              variant === "danger",
            "h-8 px-3 text-xs rounded-md": size === "sm",
            "h-10 px-4 py-2 text-sm rounded-lg min-h-[40px]": size === "md",
            "h-12 px-6 text-base rounded-xl min-h-[48px]": size === "lg",
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
