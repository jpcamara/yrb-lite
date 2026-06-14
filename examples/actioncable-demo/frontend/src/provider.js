// Yjs provider that speaks the y-websocket protocol over ActionCable.
//
// The wire format is the standard y-protocols binary messages, base64-encoded
// inside ActionCable's JSON envelope as { m: "<base64>" }. The server side is
// YrbLite::Sync (see app/channels/document_channel.rb) — one shared
// YrbLite::Awareness per document handles sync + presence natively.
import { createConsumer } from "@rails/actioncable"
import * as awarenessProtocol from "y-protocols/awareness"
import * as syncProtocol from "y-protocols/sync"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const MSG_QUERY_AWARENESS = 3

const toBase64 = (bytes) => {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export class ActionCableProvider {
  constructor(documentId, doc, { consumer } = {}) {
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)
    this.consumer = consumer || createConsumer()
    this.connected = false
    this.synced = false
    this._handlers = { status: new Set(), synced: new Set() }

    this._onDocUpdate = (update, origin) => {
      if (origin === this) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this._send(encoding.toUint8Array(encoder))
    }
    this.doc.on("update", this._onDocUpdate)

    this._onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === this) return // remote changes came from the server; don't echo
      const changed = added.concat(updated, removed)
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_AWARENESS)
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      )
      this._send(encoding.toUint8Array(encoder))
    }
    this.awareness.on("update", this._onAwarenessUpdate)

    this.subscription = this.consumer.subscriptions.create(
      { channel: "DocumentChannel", id: documentId },
      {
        connected: () => {
          this.connected = true
          this._emit("status", { status: "connected" })
          // Announce our state so the server can send us what we're missing,
          // and (re)publish our presence.
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MSG_SYNC)
          syncProtocol.writeSyncStep1(encoder, this.doc)
          this._send(encoding.toUint8Array(encoder))
          if (this.awareness.getLocalState() !== null) {
            const enc = encoding.createEncoder()
            encoding.writeVarUint(enc, MSG_AWARENESS)
            encoding.writeVarUint8Array(
              enc,
              awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
            )
            this._send(encoding.toUint8Array(enc))
          }
        },
        disconnected: () => {
          this.connected = false
          this._setSynced(false)
          this._emit("status", { status: "disconnected" })
          // Remote peers are unreachable until we reconnect.
          awarenessProtocol.removeAwarenessStates(
            this.awareness,
            Array.from(this.awareness.getStates().keys()).filter((id) => id !== this.doc.clientID),
            this
          )
        },
        received: (data) => this._received(fromBase64(data.m)),
      }
    )

    this._beforeUnload = () => {
      awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "unload")
    }
    window.addEventListener("beforeunload", this._beforeUnload)
  }

  on(event, handler) {
    this._handlers[event]?.add(handler)
  }

  destroy() {
    window.removeEventListener("beforeunload", this._beforeUnload)
    this.doc.off("update", this._onDocUpdate)
    this.awareness.off("update", this._onAwarenessUpdate)
    this.subscription.unsubscribe()
  }

  _send(bytes) {
    if (this.connected) this.subscription.send({ m: toBase64(bytes) })
  }

  // A single envelope may hold several concatenated y-protocol messages
  // (e.g. the server's opening SyncStep1 + awareness state).
  _received(bytes) {
    const decoder = decoding.createDecoder(bytes)
    while (decoding.hasContent(decoder)) {
      const messageType = decoding.readVarUint(decoder)
      switch (messageType) {
        case MSG_SYNC: {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MSG_SYNC)
          const syncType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this)
          if (encoding.length(encoder) > 1) this._send(encoding.toUint8Array(encoder))
          if (syncType === syncProtocol.messageYjsSyncStep2) this._setSynced(true)
          break
        }
        case MSG_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            this
          )
          break
        case MSG_QUERY_AWARENESS: {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MSG_AWARENESS)
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
              this.awareness,
              Array.from(this.awareness.getStates().keys())
            )
          )
          this._send(encoding.toUint8Array(encoder))
          break
        }
        default:
          console.warn("ActionCableProvider: unknown message type", messageType)
          return
      }
    }
  }

  _setSynced(synced) {
    if (this.synced === synced) return
    this.synced = synced
    this._emit("synced", { synced })
  }

  _emit(event, payload) {
    this._handlers[event]?.forEach((handler) => handler(payload))
  }
}
