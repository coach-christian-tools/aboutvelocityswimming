import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Download,
  Flag,
  Home,
  Settings,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { timesViewHref } from "@/components/collection/times-url-state";
import { worksharePath } from "@/features/workshare/lib/routes";
import {
  atlasViews,
  overviewViews,
  timesViews,
  toolDirectory,
  type AtlasView,
  type TimesView,
  type ToolId,
} from "./tool-directory";

export type ToolPage = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  includeChildren?: boolean;
};

const timesDescriptions: Record<TimesView, string> = {
  rankings:
    "Compare swimmers by event, age, and course, and explore performance rankings.",
  records: "Browse team records and the swimmers behind the fastest times.",
  standards:
    "Look up qualifying times and see how swims compare with time standards.",
  meets:
    "Find a meet and explore its events, race results, and participating swimmers.",
  athletes:
    "Find a swimmer to explore their results, personal bests, and progress.",
};

const atlasDescriptions: Record<AtlasView, string> = {
  map: "Explore swimming locations and organizations on an interactive map.",
  team: "Find swim teams and explore their locations and affiliations.",
  meet: "Browse meets by date, region, and venue, with links to original sources.",
  organization:
    "Explore the zones, local swimming committees, and organizations behind the sport.",
};

// Keep landing-page summaries and sidebar destinations in sync.
export function getToolPages(
  tool: ToolId,
  workshareAdmin: boolean,
): ToolPage[] {
  switch (tool) {
    case "overview":
      return overviewViews.map(([id, label, icon]) => ({
        id,
        label,
        icon,
        description: `Explore the swimming archive with ${label}.`,
        href: `/tools/overview?view=${id}`,
      }));
    case "times":
      return timesViews.map(([id, label, icon]) => ({
        id,
        label,
        icon,
        description: timesDescriptions[id],
        href: timesViewHref(id),
      }));
    case "atlas":
      return atlasViews.map(([id, label, icon]) => ({
        id,
        label,
        icon,
        description: atlasDescriptions[id],
        href: `${toolDirectory.atlas.href}${id === "map" ? "" : `?view=${id}`}`,
      }));
    case "workshare":
      return [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: Home,
          href: worksharePath(),
          description: workshareAdmin
            ? "Open your administrator dashboard for family accounts, postings, and shift rosters."
            : "See your family’s hours, progress toward requirements, and upcoming shifts.",
        },
        ...(!workshareAdmin
          ? [
              {
                id: "logs",
                label: "Volunteer Logs",
                icon: ClipboardList,
                href: worksharePath("logs"),
                description:
                  "Review completed volunteer shifts and your family’s recorded workshare hours.",
              },
            ]
          : []),
        {
          id: "jobs",
          label: "Job Board",
          icon: Briefcase,
          href: worksharePath("jobs"),
          description: workshareAdmin
            ? "Post volunteer opportunities and manage available shifts."
            : "Find volunteer opportunities and sign up for available shifts.",
        },
        ...(workshareAdmin
          ? [
              {
                id: "families",
                label: "Families",
                icon: Users,
                href: worksharePath("admin/families"),
                includeChildren: true,
                description:
                  "Manage family accounts, workshare requirements, and volunteer progress.",
              },
              {
                id: "roster",
                label: "Roster",
                icon: ClipboardList,
                href: worksharePath("admin/roster"),
                description:
                  "Review shift sign-ups and verify volunteer participation.",
              },
              {
                id: "settings",
                label: "Settings",
                icon: Settings,
                href: worksharePath("admin/settings"),
                description:
                  "Configure the season and workshare program settings.",
              },
            ]
          : []),
      ];
    case "imports": {
      const href = toolDirectory.imports.href;
      return [
        {
          id: "swims",
          label: "Swims",
          icon: Table2,
          href: `${href}/swims`,
          description:
            "Inspect imported swim results and find records with missing information.",
        },
        {
          id: "inventory",
          label: "Meets",
          icon: CalendarDays,
          href: `${href}/meet-inventory`,
          description:
            "Browse the meet inventory and check import status and coverage.",
        },
        {
          id: "queue",
          label: "Review queue",
          icon: ClipboardList,
          href,
          description:
            "Review proposed data changes and decide what is ready to publish.",
        },
        {
          id: "collection",
          label: "Meet collection",
          icon: CalendarDays,
          href: `${href}/meets`,
          description:
            "Manage meet collection requests and follow their progress.",
        },
        {
          id: "flagged",
          label: "Flagged results",
          icon: Flag,
          href: `${href}/results`,
          description:
            "Investigate flagged swim results and resolve data issues.",
        },
        {
          id: "exports",
          label: "Exports",
          icon: Download,
          href: `${href}/exports`,
          description:
            "Download available data exports for review and analysis.",
        },
      ];
    }
  }
}
