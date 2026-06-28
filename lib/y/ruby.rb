# frozen_string_literal: true

require_relative "ruby/version"

# Load the native extension. Precompiled gems ship it in a per-Ruby-version
# subdir (lib/y/ruby/<major.minor>/y_ruby.<ext>); a source build puts it flat at
# lib/y/ruby/y_ruby.<ext>. Try the versioned path first, fall back.
begin
  RUBY_VERSION =~ /(\d+\.\d+)/
  require_relative "ruby/#{Regexp.last_match(1)}/y_ruby"
rescue LoadError
  require_relative "ruby/y_ruby"
end

module Y
  module Ruby
    # Error class is defined in the Rust extension.
    #
    # The ActionCable integration (Y::Ruby::ActionCable::Sync) lives in the
    # separate `y-ruby-actioncable` gem; require "y/ruby/action_cable".
  end
end
