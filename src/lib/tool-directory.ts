export const toolDirectory = {
  times: {
    title: "Velocity Times",
    description: "Explore approved results and time standards for Inland Empire athletes wherever they compete.",
    href: "/tools/times",
  },
  workshare: {
    title: "Velocity Workshare",
    description: "Find volunteer opportunities, sign up for shifts, and track your family’s workshare hours.",
    href: "/tools/workshare",
  },
  atlas: {
    title: "Swim Atlas",
    description: "Explore teams, meets, swimming organizations, and documents with original source links.",
    href: "/tools/knowledge",
  },
  imports: {
    title: "Velocity Imports",
    description: "Inspect swim and meet data, and review proposed changes before publication.",
    href: "/tools/review",
    adminOnly: true,
  },
} as const;

export type ToolId = keyof typeof toolDirectory;

export function getAvailableTools(isAdmin: boolean) {
  return Object.entries(toolDirectory).filter(([, tool]) => isAdmin || !("adminOnly" in tool));
}
