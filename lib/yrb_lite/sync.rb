# frozen_string_literal: true

require "base64"
require "securerandom"

module YrbLite
  # y-websocket protocol over ActionCable.
  #
  # Include this module in an ActionCable channel to sync Y.js documents
  # (and awareness/presence) with browser clients. Messages are the standard
  # y-protocols binary messages, base64-encoded in a JSON envelope:
  #
  #   { "m" => "<base64 bytes>" }              # client -> server
  #   { "m" => "...", "origin" => "<id>" }     # server -> subscribers
  #
  # Example:
  #   class DocumentChannel < ApplicationCable::Channel
  #     include YrbLite::Sync
  #
  #     on_load { |key| Document.find_by(key: key)&.content }
  #     on_save { |key, update| Document.find_by(key: key)&.update!(content: update) }
  #
  #     def subscribed
  #       sync_for params[:id]
  #     end
  #
  #     def receive(data)
  #       sync_receive(data)
  #     end
  #
  #     def unsubscribed
  #       sync_clear_presence
  #     end
  #   end
  #
  # The shared YrbLite::Awareness instances are safe to use from ActionCable's
  # worker thread pool: the native types are Send + Sync and every operation
  # releases the GVL, so concurrent clients sync in parallel.
  module Sync
    MSG_SYNC = 0
    MSG_AWARENESS = 1
    MSG_SYNC_STEP1 = 0

    def self.included(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      # Load persisted document state. Called once per key with (key);
      # return a binary Y.js update (or nil for a fresh document).
      def on_load(callable = nil, &block)
        @on_load = callable || block if callable || block
        @on_load
      end

      # Persist document state. Called with (key, update) after every
      # message that modified the document.
      def on_save(callable = nil, &block)
        @on_save = callable || block if callable || block
        @on_save
      end
    end

    # Call from `subscribed`. Streams broadcasts for this document and
    # transmits the server's opening handshake (SyncStep1 + awareness).
    def sync_for(key)
      @sync_key = key.to_s
      @sync_origin = SecureRandom.hex(8)
      @sync_clients = [] # awareness client IDs seen on this connection
      awareness = sync_awareness

      stream_from sync_stream_name, coder: ActiveSupport::JSON do |payload|
        # Don't echo a client's own messages back to it.
        transmit(payload) unless payload["origin"] == @sync_origin
      end

      transmit({ "m" => Base64.strict_encode64(awareness.start) })
    end

    # Call from `receive`. Applies the client's message, replies directly
    # when the protocol calls for it, and relays document/awareness changes
    # to the other subscribers.
    def sync_receive(data)
      bytes = Base64.strict_decode64(data["m"])
      awareness = sync_awareness
      sync_track_clients(awareness, bytes)
      response = awareness.handle(bytes)

      transmit({ "m" => Base64.strict_encode64(response) }) unless response.empty?

      return unless sync_broadcast?(bytes)

      ActionCable.server.broadcast(
        sync_stream_name,
        { "m" => data["m"], "origin" => @sync_origin }
      )
      sync_persist if sync_modifies_doc?(bytes)
    end

    # Call from `unsubscribed`. Clears the presence states this connection
    # introduced and tells the other subscribers to drop those cursors, so a
    # closed tab or dropped socket doesn't leave a ghost cursor behind until
    # the client-side timeout reaps it.
    def sync_clear_presence
      return if @sync_clients.nil? || @sync_clients.empty?

      removal = sync_awareness.remove_clients(@sync_clients)
      @sync_clients = []
      return if removal.empty?

      ActionCable.server.broadcast(
        sync_stream_name,
        { "m" => Base64.strict_encode64(removal), "origin" => @sync_origin }
      )
    end

    # The shared Awareness (document + presence) for this channel's key.
    # Also useful for server-side reads, e.g.:
    #   YrbLite::ProseMirrorExtractor.extract(sync_awareness.encode_state_as_update)
    def sync_awareness
      Sync.awareness_for(@sync_key, self.class.on_load)
    end

    private

    # Record the awareness client IDs carried by an incoming message so we
    # can clear exactly those states when this connection closes.
    def sync_track_clients(awareness, bytes)
      return unless bytes.getbyte(0) == MSG_AWARENESS

      awareness.awareness_client_ids(bytes).each do |id|
        @sync_clients << id unless @sync_clients.include?(id)
      end
    end

    def sync_stream_name
      "yrb_lite:#{@sync_key}"
    end

    # Relay messages that change shared state: SyncStep2/Update (document
    # content) and awareness updates. SyncStep1 is a request addressed to
    # the server alone — relaying it would make every client answer.
    def sync_broadcast?(bytes)
      case bytes.getbyte(0)
      when MSG_SYNC then bytes.getbyte(1) != MSG_SYNC_STEP1
      when MSG_AWARENESS then true
      else false
      end
    end

    def sync_modifies_doc?(bytes)
      bytes.getbyte(0) == MSG_SYNC && bytes.getbyte(1) != MSG_SYNC_STEP1
    end

    def sync_persist
      return unless (saver = self.class.on_save)

      saver.call(@sync_key, sync_awareness.encode_state_as_update)
    end

    # -- Shared document registry ------------------------------------------

    @registry = {}
    @registry_mutex = Mutex.new

    class << self
      # Get or create the shared Awareness for a key. Creation (including
      # the on_load callback) is serialized under a mutex so concurrent
      # subscribers can never observe two documents for one key; all
      # subsequent operations run lock-free on the thread-safe native types.
      def awareness_for(key, loader = nil)
        @registry_mutex.synchronize do
          @registry[key] ||= begin
            awareness = YrbLite::Awareness.new
            if loader && (state = loader.call(key))
              awareness.apply_update(state)
            end
            awareness
          end
        end
      end

      def registry
        @registry_mutex.synchronize { @registry.dup }
      end

      # Clear all documents (useful for testing).
      def reset!
        @registry_mutex.synchronize { @registry = {} }
      end
    end
  end
end
