# frozen_string_literal: true

require "y/ruby"
require "y/ruby/action_cable/version"

module Y::Ruby
  # ActionCable integration for y-ruby.
  #
  # Provides Y::Ruby::ActionCable::Sync, a channel concern implementing the
  # y-websocket sync protocol and awareness/presence over ActionCable (and
  # AnyCable), so a Rails app can be the collaboration server for Y.js editors
  # with no Node sidecar. The CRDT documents, awareness, and protocol primitives
  # themselves come from the core `y-ruby` gem.
  module ActionCable
  end
end

require "y/ruby/action_cable/sync"
