import * as Y from "yjs"
import { createConsumer } from "@rails/actioncable"
import { ActionCableProvider } from "yrb-lite-client"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCursor from "@tiptap/extension-collaboration-cursor"

const NAMES = ["Ada", "Grace", "Linus", "Yukihiro", "Barbara", "Dennis", "Radia", "Alan"]
const COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#f472b6"]

const element = document.getElementById("editor")
const statusEl = document.getElementById("status")
const documentId = element.dataset.documentId

const user = {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
}

const ydoc = new Y.Doc()
const consumer = createConsumer()
const provider = new ActionCableProvider(ydoc, consumer, "DocumentChannel", { id: documentId })
provider.connect()

statusEl.dataset.state = "connecting"
statusEl.textContent = `connecting as ${user.name}…`
const poll = setInterval(() => {
  if (provider.synced) {
    statusEl.dataset.state = "connected"
    statusEl.textContent = `synced, editing as ${user.name}`
    clearInterval(poll)
  }
}, 150)

const editor = new Editor({
  element,
  extensions: [
    StarterKit.configure({ history: false }), // Collaboration brings its own undo
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({ provider, user }),
  ],
})

// Exposed for the browser console and the multi-browser test harness.
window.__yrb = { provider, ydoc, editor, user }
