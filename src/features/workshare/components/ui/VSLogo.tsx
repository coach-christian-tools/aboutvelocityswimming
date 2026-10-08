import Image from "next/image"

interface VSLogoProps {
  variant?: "full" | "white"
  size?: "sm" | "md" | "lg"
  className?: string
  showBadge?: boolean
}

export function VSLogo({ 
  variant = "full", 
  size = "md", 
  className = "",
  showBadge = false
}: VSLogoProps) {
  const logoSrc = `/workshare/velocity-logo-${variant === "white" ? "white" : "dark"}.png`

  const imgHeightClasses = {
    sm: "h-6 sm:h-7",
    md: "h-8 sm:h-9",
    lg: "h-10 sm:h-12"
  }

  const badgeClasses = {
    sm: "text-[10px] px-1.5 py-0.2",
    md: "text-xs px-2 py-0.5",
    lg: "text-xs sm:text-sm px-2.5 py-0.5"
  }

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <Image
        width={1024}
        height={224}
        unoptimized
        loading="eager"
        src={logoSrc} 
        alt="Velocity Swimming" 
        className={`${imgHeightClasses[size]} w-auto object-contain flex-shrink-0`} 
      />
      {showBadge && (
        <span className={`font-extrabold tracking-wider uppercase bg-[#0A856C]/10 text-[#0A856C] rounded-md font-sans ${badgeClasses[size]}`}>
          Workshare
        </span>
      )}
    </div>
  )
}
