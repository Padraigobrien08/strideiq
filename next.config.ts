import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Pin Turbopack's workspace root to THIS directory. Without this, Next walks
// up the tree, finds a stray lockfile in the home folder, and treats all of
// ~/ as the project — its file-watcher then indexes the entire home directory
// and consumes enormous amounts of memory. See README "Troubleshooting".
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/api/auth/strava",
        destination: "/api/auth/strava/authorize",
        permanent: false,
      },
      // Overhaul Phase 3: the week moved to /training and the race goal to /progress.
      // Temporary (307) while old links and bookmarks age out; the goal rule must come
      // first, since both match /plan.
      {
        source: "/plan",
        has: [{ type: "query", key: "tab", value: "goal" }],
        destination: "/progress",
        permanent: false,
      },
      { source: "/plan", destination: "/training", permanent: false },
    ];
  },
};

export default nextConfig;
