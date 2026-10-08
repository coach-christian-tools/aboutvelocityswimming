import { forwardRef } from "react"
import { cn } from "../../lib/utils"
import { motion } from "framer-motion"
import type { HTMLMotionProps } from "framer-motion"

type CardProps = HTMLMotionProps<"div">

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      ref={ref}
      className={cn("rounded-2xl bg-white border border-slate-200/90 shadow-xs p-5 md:p-6 text-[#13415D]", className)}
      {...props}
    />
  )
)
Card.displayName = "Card"

