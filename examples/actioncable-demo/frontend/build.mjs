// Bundles the demo's frontend with a single shared copy of yjs (and the other
// CRDT singletons). yrb-lite-client lists yjs/y-protocols as *devDependencies*
// so it can build its own dist/, which leaves a nested
// packages/yrb-lite-client/node_modules/yjs on disk. Without deduping, Bun
// resolves the provider's `import "yjs"` to that nested copy while the editor
// (Tiptap/y-prosemirror) uses the top-level one — two Y.js instances in one
// bundle. That trips Yjs's "already imported" guard and breaks constructor
// checks, so y-prosemirror throws "Method unimplemented" applying remote
// updates: the editor view never renders incoming content and the next local
// keystroke clobbers it. Pinning these modules to one canonical path keeps the
// editor and provider on the same Y.Doc internals.
//
//   bun build.mjs            # one-shot build
//   bun build.mjs --watch    # rebuild on change
/* global Bun */
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

// One canonical resolution per CRDT singleton, taken from the top-level
// node_modules so every importer (editor and provider alike) shares it.
const SINGLETONS = ["yjs", "y-protocols", "lib0"]
const canonical = (name) => resolve(here, "node_modules", name)

const dedupeSingletons = {
  name: "dedupe-crdt-singletons",
  setup(build) {
    for (const name of SINGLETONS) {
      // Bare specifier ("yjs") and subpath specifiers ("y-protocols/awareness",
      // "lib0/encoding") both have to land in the one canonical package.
      const filter = new RegExp(`^${name}(/.*)?$`)
      build.onResolve({ filter }, (args) => {
        const subpath = args.path.slice(name.length) // "" or "/awareness"
        // Resolve the specifier as if it were imported from the top-level
        // package, so subpath exports map through the canonical package.json.
        const target = subpath ? canonical(name) + subpath : canonical(name)
        return { path: Bun.resolveSync(target, here) }
      })
    }
  },
}

async function build() {
  const result = await Bun.build({
    entrypoints: [resolve(here, "src/app.js")],
    outdir: resolve(here, "../public"),
    naming: "app.js",
    minify: true,
    plugins: [dedupeSingletons],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    return false
  }
  console.log("built ../public/app.js")
  return true
}

if (process.argv.includes("--watch")) {
  const { watch } = await import("node:fs")
  await build()
  let pending
  watch(resolve(here, "src"), { recursive: true }, () => {
    clearTimeout(pending)
    pending = setTimeout(build, 50) // debounce editor save bursts
  })
  console.log("watching src/ …")
} else if (!(await build())) {
  process.exit(1)
}
