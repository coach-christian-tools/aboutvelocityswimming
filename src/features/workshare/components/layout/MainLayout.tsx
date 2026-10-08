import { useState, useEffect, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { LogOut, Home, Briefcase, Users, Settings, ClipboardList, Shield, Eye, EyeOff, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useAuth } from "../../contexts/auth"
import { VSLogo } from "../ui/VSLogo"

const DEFAULT_SIDEBAR_WIDTH = 256
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 480
const SIDEBAR_STORAGE_KEY = "admin_sidebar_width"
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed"

export function MainLayout({ children, isAdmin = false }: { children: ReactNode, isAdmin?: boolean }) {
  const { user, logout, isAdmin: authIsAdmin, clientMode, setClientMode, setPreviewFamilyId } = useAuth()
  const effectiveIsAdmin = (isAdmin || authIsAdmin) && !clientMode
  const location = useLocation()
  const navigate = useNavigate()
  const isResizable = effectiveIsAdmin || location.pathname.startsWith("/admin")

  const handleToggleClientMode = () => {
    if (clientMode) {
      setClientMode(false)
      setPreviewFamilyId(null)
      navigate('/admin/families')
    } else {
      const match = location.pathname.match(/\/admin\/families\/([^/]+)/)
      if (match) {
        setPreviewFamilyId(match[1])
      } else {
        setPreviewFamilyId(null)
      }
      setClientMode(true)
      navigate('/')
    }
  }

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
    } catch {
      return false
    }
  })

  // Persist sidebar collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed.toString())
    } catch {
      // ignore
    }
  }, [isCollapsed])

  // Global keyboard shortcut to toggle sidebar ([ or Cmd+B / Ctrl+B)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT")
      ) {
        return
      }

      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setIsCollapsed(prev => !prev)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        setIsCollapsed(prev => !prev)
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_SIDEBAR_WIDTH
  })
  const [isDragging, setIsDragging] = useState(false)

  const handleOpenSidebar = () => {
    if (sidebarWidth < MIN_SIDEBAR_WIDTH) {
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    }
    setIsCollapsed(false)
  }

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      if (e.clientX < 100) {
        setIsCollapsed(true)
        setIsDragging(false)
        return
      }
      const maxAllowed = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5))
      const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), maxAllowed)
      setSidebarWidth(newWidth)
    }

    const handlePointerUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
    }
  }, [isDragging])

  // Persist sidebar width when dragging concludes
  useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarWidth.toString())
      } catch {
        // ignore
      }
    }
  }, [sidebarWidth, isDragging])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return // Only left-click drag
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDoubleClick = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      if (sidebarWidth <= MIN_SIDEBAR_WIDTH) {
        setIsCollapsed(true)
      } else {
        setSidebarWidth(w => Math.max(w - 10, MIN_SIDEBAR_WIDTH))
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      setSidebarWidth(w => Math.min(w + 10, MAX_SIDEBAR_WIDTH))
    } else if (e.key === "Enter" || e.key === " " || e.key === "Home") {
      e.preventDefault()
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setIsCollapsed(true)
    }
  }

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true
    if (path !== "/" && location.pathname.startsWith(path)) return true
    return false
  }

  const navLinks = [
    { to: "/", label: "Dashboard", icon: Home },
    ...(effectiveIsAdmin
      ? []
      : [
        { to: "/logs", label: "Volunteer Logs", icon: ClipboardList }
      ]),
    { to: "/jobs", label: "Job Board", icon: Briefcase },
    ...(effectiveIsAdmin
      ? [
        { to: "/admin/families", label: "Families", icon: Users },
        { to: "/admin/roster", label: "Roster", icon: ClipboardList },
        { to: "/admin/settings", label: "Settings", icon: Settings },
      ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-[#13415D] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between md:hidden">
        <Link to="/" className="flex items-center">
          <VSLogo size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <a href="/tools" className="text-xs underline p-2">Tools</a>
          {effectiveIsAdmin && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#0A856C]/10 text-[#0A856C] px-2 py-0.5 rounded-full">
              <Shield className="w-3.5 h-3.5" /> Admin
            </span>
          )}
          {(isAdmin || authIsAdmin) && (
            <button
              onClick={handleToggleClientMode}
              aria-label={clientMode ? "To Admin" : "View Client"}
              className="p-2 rounded-lg text-slate-500 hover:text-[#13415D] hover:bg-slate-100 transition-colors"
            >
              {clientMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={logout}
            aria-label="Sign Out"
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Sidebar Expand Button (Desktop only, when collapsed) */}
      {isCollapsed && (
        <button
          type="button"
          onClick={handleOpenSidebar}
          aria-label="Open navigation sidebar"
          title="Open sidebar (⌘B or [)"
          className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-600 hover:text-[#0A856C] hover:bg-white hover:border-[#0A856C]/40 hover:shadow transition-all cursor-pointer z-40 fixed bottom-4 left-4 group focus-visible:ring-2 focus-visible:ring-[#0A856C]"
        >
          <PanelLeftOpen className="w-4 h-4 text-slate-500 group-hover:text-[#0A856C] transition-colors" />
          <span className="text-xs font-semibold text-[#13415D] group-hover:text-[#0A856C] transition-colors">
            Expand
          </span>
        </button>
      )}

      {/* Desktop Sidebar */}
      <aside
        aria-label="Navigation Sidebar"
        aria-hidden={isCollapsed}
        style={{
          width: isCollapsed ? 0 : `${sidebarWidth}px`,
        }}
        className={`hidden md:flex flex-col h-screen sticky top-0 bg-white z-30 shrink-0 relative overflow-hidden ${isCollapsed
          ? "border-r-0 shadow-none pointer-events-none"
          : "border-r border-slate-200/90 shadow-xs"
          } ${isDragging ? "select-none transition-none" : "transition-[width] duration-200 ease-in-out"}`}
      >
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="flex flex-col h-full min-w-full overflow-hidden"
        >
          {/* Resize Handle for Desktop Admin */}
          {!isCollapsed && isResizable && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={sidebarWidth}
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              aria-valuemax={MAX_SIDEBAR_WIDTH}
              aria-label="Resize navigation sidebar"
              tabIndex={0}
              onPointerDown={handlePointerDown}
              onDoubleClick={handleDoubleClick}
              onKeyDown={handleKeyDown}
              title="Click and drag to resize sidebar (double-click to reset)"
              className={`absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-40 group flex items-center justify-center select-none outline-none focus-visible:ring-2 focus-visible:ring-[#0A856C] ${isDragging ? "bg-[#0A856C]/15" : "hover:bg-slate-200/50"
                }`}
            >
              {/* Visual Grip Indicator */}
              <div
                className={`w-1 h-8 rounded-full transition-colors ${isDragging
                  ? "bg-[#0A856C]"
                  : "bg-slate-300/80 group-hover:bg-[#0A856C]"
                  }`}
              />
            </div>
          )}

          <div className="p-6 pb-4 overflow-hidden">
            <Link to="/" className="flex items-center">
              <VSLogo size="md" />
            </Link>
            {effectiveIsAdmin && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-[#0A856C]/10 text-[#0A856C] px-2.5 py-1 rounded-full whitespace-nowrap">
                <Shield className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Administrator</span>
              </div>
            )}
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
            <a href="/tools" className="block px-3.5 py-2.5 text-sm text-slate-500 hover:underline">← Back to Tools</a>
            {navLinks.map((link) => {
              const Icon = link.icon
              const active = isActive(link.to)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${active
                    ? "bg-[#0A856C] text-white shadow-xs font-semibold"
                    : "text-[#13415D] hover:bg-slate-100/80 hover:text-[#0A856C]"
                    }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${active ? "text-white" : "text-[#13415D]/70"}`} />
                  <span className="truncate">{link.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="p-4 border-t border-slate-100 mt-auto overflow-hidden">
            <div className="mb-2 px-2">
              <p className="text-xs text-slate-400 font-medium truncate">Logged in as</p>
              <p className="text-xs font-semibold text-[#13415D] truncate">{user?.email?.split('@')[0]}</p>
            </div>
            {(isAdmin || authIsAdmin) && (
              <button
                onClick={handleToggleClientMode}
                className="flex w-full items-center gap-2.5 px-3 py-2 mb-1 rounded-xl text-sm font-semibold text-[#13415D] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {clientMode ? (
                  <>
                    <EyeOff className="w-4 h-4 shrink-0 text-slate-500" />
                    <span className="truncate">To Admin</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 shrink-0 text-slate-500" />
                    <span className="truncate">View Client</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 px-3 py-2 mb-1 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="truncate">Sign Out</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse navigation sidebar"
              title="Collapse sidebar (⌘B or [)"
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-[#13415D] transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="truncate">Collapse</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 min-w-0">
        <div className="max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Mobile Sticky Bottom Tab Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-1.5 px-2 flex justify-around items-center md:hidden shadow-lg safe-area-bottom">
        {navLinks.map((link) => {
          const Icon = link.icon
          const active = isActive(link.to)
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-xs font-medium transition-all ${active
                ? "text-[#0A856C] font-bold"
                : "text-slate-500 hover:text-[#13415D]"
                }`}
            >
              <div className={`p-1 rounded-full ${active ? "bg-[#0A856C]/10" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "text-[#0A856C]" : "text-slate-500"}`} />
              </div>
              <span className="text-[10px] mt-0.5">{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
