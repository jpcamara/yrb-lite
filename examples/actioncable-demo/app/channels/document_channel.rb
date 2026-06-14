# frozen_string_literal: true

# Collaborative document channel — the whole y-websocket protocol is three
# lines thanks to YrbLite::Sync. Documents live in memory; add on_load /
# on_save callbacks to persist them.
class DocumentChannel < ApplicationCable::Channel
  include YrbLite::Sync

  def subscribed
    sync_for params[:id]
  end

  def receive(data)
    sync_receive(data)
  end

  def unsubscribed
    sync_clear_presence
  end
end
