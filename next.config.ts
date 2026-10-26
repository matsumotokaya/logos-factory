import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workflow-lab compose/templates routes read labs/workflow/templates/
  // from the filesystem at request time; static analysis can't see those files.
  outputFileTracingIncludes: {
    "/api/labs/workflow/*": ["./labs/workflow/templates/**/*"],
    // The project export copies the template's own source into the zip, reading
    // it at request time from the import closure. Nothing imports these files
    // into the route, so tracing cannot see them.
    "/api/brands/[id]/videos/[videoId]/project": [
      "./remotion/**/*",
      "./lib/**/*",
      "./public/defaults/**/*",
      "./package.json",
    ],
  },
  // Legacy URLs from lab renames/graduations. Declared here (not as page-level
  // redirect()) because a statically prerendered page can't emit an HTTP
  // redirect in the production build.
  async redirects() {
    return [
      { source: "/lab", destination: "/labs/motion", permanent: true },
      { source: "/labs/image", destination: "/labs/workflow", permanent: true },
    ];
  },
};

export default nextConfig;
