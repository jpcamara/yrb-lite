import * as Y from "yjs"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCursor from "@tiptap/extension-collaboration-cursor"
import { ActionCableProvider } from "./provider"

const NAMES = ["Ada", "Grace", "Linus", "Yukihiro", "Barbara", "Dennis", "Radia", "Alan"]
const COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#f472b6"]

const element = document.getElementById("editor")
const status = document.getElementById("status")
const documentId = element.dataset.documentId

const ydoc = new Y.Doc()
const provider = new ActionCableProvider(documentId, ydoc)

const user = {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
}

provider.on("status", ({ status: state }) => {
  status.dataset.state = state
  status.textContent = state === "connected" ? `connected as ${user.name}` : "disconnected"
})
provider.on("synced", ({ synced }) => {
  if (synced) status.textContent = `synced — editing as ${user.name}`
})

new Editor({
  element,
  extensions: [
    StarterKit.configure({ history: false }), // Collaboration brings its own undo
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({ provider, user }),
  ],
})
