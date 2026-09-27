// Production bundler for the API.
//
// esbuild bundles src/server.ts (and the @medivault/shared workspace package,
// resolved from its TypeScript source) into a single dist/server.js.
//
// `external` packages are NOT bundled — they're resolved from node_modules at
// runtime. We externalize the ones that ship native binaries or use worker
// threads / dynamic requires that don't survive bundling:
//   - @prisma/client : ships native query engines
//   - pino, pino-pretty : use thread-stream worker files loaded via __dirname
//
// The banner shims `require`, `__dirname`, `__filename` into the ESM output so
// any transitive CJS code that expects them keeps working.

import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  sourcemap: true,
  external: ["@prisma/client", "pino", "pino-pretty"],
  banner: {
    js: [
      "import{createRequire as __cr}from'module';",
      "import{fileURLToPath as __ftp}from'url';",
      "import{dirname as __dn}from'path';",
      "const require=__cr(import.meta.url);",
      "const __filename=__ftp(import.meta.url);",
      "const __dirname=__dn(__filename);",
    ].join(""),
  },
});

console.log("bundled → dist/server.js");
