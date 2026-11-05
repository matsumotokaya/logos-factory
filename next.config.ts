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
      // 2026-11-05: the brand tree split into Assets and Works, and the URLs
      // mirror the branches (docs/product.md §2.1). Old bookmarks keep working.
      {
        source: "/brands/:id/logos/:path*",
        destination: "/brands/:id/assets/logos/:path*",
        permanent: true,
      },
      {
        source: "/brands/:id/video/:path*",
        destination: "/brands/:id/works/video/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
