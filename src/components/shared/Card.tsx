import { forwardRef } from "react";
import { cn } from "@/lib/classes";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

type CardProps = HTMLMotionProps<"div">;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      ref={ref}
      className={cn(
        "rounded-2xl bg-surface border border-border shadow-xs p-5 md:p-6 text-text-primary",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
