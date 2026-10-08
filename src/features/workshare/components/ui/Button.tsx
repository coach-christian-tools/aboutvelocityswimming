import { forwardRef } from "react"
import { cn } from "../../lib/utils"
import { motion } from "framer-motion"
import type { HTMLMotionProps } from "framer-motion"

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A856C] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
          {
            "bg-[#0A856C] text-white hover:bg-[#086b57] active:bg-[#065343] shadow-xs": variant === "primary",
            "bg-[#13415D] text-white hover:bg-[#0d2e42] active:bg-[#09202f] shadow-xs": variant === "secondary",
            "border border-slate-300 bg-white text-[#13415D] hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100": variant === "outline",
            "bg-transparent text-[#13415D] hover:bg-slate-100 active:bg-slate-200": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-xs": variant === "danger",
            "h-8 px-3 text-xs rounded-md": size === "sm",
            "h-10 px-4 py-2 text-sm rounded-lg min-h-[40px]": size === "md",
            "h-12 px-6 text-base rounded-xl min-h-[48px]": size === "lg",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

