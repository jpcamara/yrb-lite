// Vendored from @y-rb/actioncable (dist/actioncable.esm.js, v0.3.x),
// detranspiled to readable ESM. This commit is the upstream `WebsocketProvider`
// with no behavior changes; yrb-lite's reliable-delivery layer is added in the
// next commit so its diff stands on its own.
import { writeVarUint, writeVarUint8Array, createEncoder, length, toUint8Array } from "lib0/encoding"
import { readVarUint8Array, createDecoder, readVarUint } from "lib0/decoding"
import {
  readSyncMessage,
  messageYjsSyncStep2,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync"
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
  Awareness,
} from "y-protocols/awareness"
import { readAuthMessage } from "y-protocols/auth"
import { publish, subscribe, unsubscribe } from "lib0/broadcastchannel"

const MessageType = { Sync: 0, Awareness: 1, Auth: 2, QueryAwareness: 3 }

const permissionDeniedHandler = (provider, reason) =>
  console.warn(`Permission denied to access ${provider.channelName}.\n${reason}`)

const messageHandlers = {
  [MessageType.Sync]: (encoder, decoder, provider, emitSynced) => {
    writeVarUint(encoder, MessageType.Sync)
    const syncMessageType = readSyncMessage(decoder, encoder, provider.doc, provider)
    if (emitSynced && syncMessageType === messageYjsSyncStep2 && !provider.synced) {
      provider.synced = true
    }
  },
  [MessageType.QueryAwareness]: (encoder, _decoder, provider) => {
    writeVarUint(encoder, MessageType.Awareness)
    writeVarUint8Array(
      encoder,
      encodeAwarenessUpdate(provider.awareness, Array.from(provider.awareness.getStates().keys()))
    )
  },
  [MessageType.Awareness]: (_encoder, decoder, provider) => {
    applyAwarenessUpdate(provider.awareness, readVarUint8Array(decoder), provider)
  },
  [MessageType.Auth]: (_encoder, decoder, provider) => {
    readAuthMessage(decoder, provider.doc, (_ydoc, reason) => permissionDeniedHandler(provider, reason))
  },
}

export class WebsocketProvider {
  constructor(doc, consumer, channel, params, { awareness = new Awareness(doc), disableBc = false } = {}) {
    this.consumer = consumer
    this.channel = undefined
    this.params = params
    this.doc = doc
    this.channelName = channel
    this.bcChannelName = `${channel}_${Object.entries(params).map((k, v) => `${k}-${v}`).join("_")}`
    this.awareness = awareness
    this.bcconnected = false
    this.disableBc = disableBc
    this._synced = false

    this.bcSubscriber = (data, origin) => {
      if (origin !== this) {
        const encoder = this.process(new Uint8Array(data), false)
        if (length(encoder) > 1) publish(this.bcChannelName, toUint8Array(encoder), this)
      }
    }
    this.updateHandler = (update, origin) => {
      if (origin !== this) {
        const encoder = createEncoder()
        writeVarUint(encoder, MessageType.Sync)
        writeUpdate(encoder, update)
        this.send(toUint8Array(encoder))
      }
    }
    this.unloadHandler = () => {
      removeAwarenessStates(this.awareness, [this.doc.clientID], "window unload")
    }
    this.awarenessUpdateHandler = ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed)
      const encoder = createEncoder()
      writeVarUint(encoder, MessageType.Awareness)
      writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, changedClients))
      this.send(toUint8Array(encoder), { whisper: true })
    }

    this.doc.on("update", this.updateHandler)
    if (typeof window !== "undefined") window.addEventListener("unload", this.unloadHandler)
    else if (typeof process !== "undefined") process.on("exit", this.unloadHandler)
    this.awareness.on("update", this.awarenessUpdateHandler)

    this.connect()
  }

  get synced() {
    return this._synced
  }

  set synced(state) {
    if (this._synced !== state) this._synced = state
  }

  destroy() {
    this.disconnect()
    if (typeof window !== "undefined") window.removeEventListener("unload", this.unloadHandler)
    else if (typeof process !== "undefined") process.off("exit", this.unloadHandler)
    this.awareness.off("update", this.awarenessUpdateHandler)
    this.doc.off("update", this.updateHandler)
  }

  send(buffer, { whisper = false } = {}) {
    const update = encodeBinaryToBase64(buffer)
    if (whisper && hasWhisper(this.channel)) this.channel.whisper({ update })
    else this.channel?.send({ update })
    if (this.bcconnected) publish(this.bcChannelName, buffer, this)
  }

  process(buffer, emitSynced) {
    const decoder = createDecoder(buffer)
    const encoder = createEncoder()
    const messageType = readVarUint(decoder)
    const messageHandler = messageHandlers[messageType]
    if (messageHandler) messageHandler(encoder, decoder, this, emitSynced, messageType)
    else console.error("Unable to compute message")
    return encoder
  }

  subscribe() {
    const provider = this
    this.synced = false
    this.channel = this.consumer.subscriptions.create(
      { channel: this.channelName, ...this.params },
      {
        received(message) {
          const encodedUpdate = message.update
          const update = decodeBase64ToBinary(encodedUpdate)
          const encoder = provider.process(update, true)
          if (length(encoder) > 1) provider.send(toUint8Array(encoder))
        },
        disconnected() {
          provider.synced = false
          // update awareness (all users except local left)
          removeAwarenessStates(
            provider.awareness,
            Array.from(provider.awareness.getStates().keys()).filter((client) => client !== provider.doc.clientID),
            provider
          )
        },
        connected() {
          // always send sync step 1 when connected
          const encoder = createEncoder()
          writeVarUint(encoder, MessageType.Sync)
          writeSyncStep1(encoder, provider.doc)
          provider.send(toUint8Array(encoder))
          // broadcast local awareness state
          if (provider.awareness.getLocalState() !== null) {
            const encoderAwarenessState = createEncoder()
            writeVarUint(encoderAwarenessState, MessageType.Awareness)
            writeVarUint8Array(
              encoderAwarenessState,
              encodeAwarenessUpdate(provider.awareness, [provider.doc.clientID])
            )
            provider.send(toUint8Array(encoderAwarenessState))
          }
        },
      }
    )
  }

  connectBc() {
    if (this.disableBc) return
    if (!this.bcconnected) {
      subscribe(this.bcChannelName, this.bcSubscriber)
      this.bcconnected = true
    }
    // send sync step 1 to bc
    const encoderSync = createEncoder()
    writeVarUint(encoderSync, MessageType.Sync)
    writeSyncStep1(encoderSync, this.doc)
    publish(this.bcChannelName, toUint8Array(encoderSync), this)
    // broadcast local state
    const encoderState = createEncoder()
    writeVarUint(encoderState, MessageType.Sync)
    writeSyncStep2(encoderState, this.doc)
    publish(this.bcChannelName, toUint8Array(encoderState), this)
    // write queryAwareness
    const encoderAwarenessQuery = createEncoder()
    writeVarUint(encoderAwarenessQuery, MessageType.QueryAwareness)
    publish(this.bcChannelName, toUint8Array(encoderAwarenessQuery), this)
    // broadcast local awareness state
    const encoderAwarenessState = createEncoder()
    writeVarUint(encoderAwarenessState, MessageType.Awareness)
    writeVarUint8Array(encoderAwarenessState, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))
    publish(this.bcChannelName, toUint8Array(encoderAwarenessState), this)
  }

  disconnectBc() {
    // broadcast message with local awareness state set to null (indicating disconnect)
    const encoder = createEncoder()
    writeVarUint(encoder, MessageType.Awareness)
    writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map()))
    this.send(toUint8Array(encoder))
    if (this.bcconnected) {
      unsubscribe(this.bcChannelName, this.bcSubscriber)
      this.bcconnected = false
    }
  }

  disconnect() {
    this.disconnectBc()
    this.channel?.unsubscribe()
    if (this.channel != null) this.channel = undefined
  }

  connect() {
    if (this.channel == null) {
      this.subscribe()
      this.connectBc()
    }
  }
}

function encodeBinaryToBase64(bin) {
  return btoa(Array.from(bin, (ch) => String.fromCharCode(ch)).join(""))
}

function decodeBase64ToBinary(update) {
  return Uint8Array.from(atob(update), (c) => c.charCodeAt(0))
}

function hasWhisper(channel) {
  return channel !== undefined && "whisper" in channel && typeof channel.whisper === "function"
}
