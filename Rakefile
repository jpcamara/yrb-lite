# frozen_string_literal: true

require "bundler"
require "rake/testtask"
require "rake/extensiontask"
require "rb_sys/extensiontask"

# This repo ships two gems (core `yrb-lite` + `yrb-lite-actioncable`), so the
# default bundler/gem_tasks can't auto-pick a gemspec. Scope build/release/install
# to the core gem; the pure-Ruby actioncable gem builds via `rake actioncable:build`.
Bundler::GemHelper.install_tasks(name: "yrb-lite")

Rake::TestTask.new(:test) do |t|
  t.libs << "test"
  t.libs << "lib"
  t.test_files = FileList["test/**/*_test.rb"]
end

desc "Build the yrb-lite-actioncable gem into pkg/"
task "actioncable:build" do
  require_relative "lib/yrb_lite/action_cable/version"
  mkdir_p "pkg"
  sh "gem build yrb-lite-actioncable.gemspec --output " \
     "pkg/yrb-lite-actioncable-#{YrbLite::ActionCable::VERSION}.gem"
end

namespace :release do
  desc "Print the two-gem release sequence (core via precompiled CI; actioncable pure Ruby)"
  task :steps do
    require_relative "lib/yrb_lite/version"
    require_relative "lib/yrb_lite/action_cable/version"
    core = YrbLite::VERSION
    cable = YrbLite::ActionCable::VERSION
    puts <<~STEPS
      This repo ships TWO gems. Release them together when the shared core API changes.
      JP runs the `gem push`/`git push` steps (RubyGems MFA + the default-branch guard).

      1) yrb-lite #{core}  — core, native extension; precompiled platform gems via CI
         a. bump lib/yrb_lite/version.rb + CHANGELOG.md, then commit
         b. git tag v#{core} && git push origin main "v#{core}"
         c. the "Precompiled gems" workflow builds 8 platform gems + the source gem
         d. gh run download <run-id> --dir tmp/ ; cp tmp/**/*.gem pkg/
         e. gem push pkg/yrb-lite-#{core}*.gem        # 9 gems: source + 8 platforms

      2) yrb-lite-actioncable #{cable}  — pure Ruby; one gem, no precompilation
         a. bump lib/yrb_lite/action_cable/version.rb + CHANGELOG-actioncable.md, commit
         b. rake actioncable:build
         c. gem push pkg/yrb-lite-actioncable-#{cable}.gem

      The actioncable gem depends on `yrb-lite >= 0.1.0.beta5` (a floor, so it tolerates
      newer core releases); only raise it when it needs a newer core API.
    STEPS
  end
end

# Passing the gemspec registers the cross-compilation tasks
# (`native:<platform> gem`) that the precompiled-gem build relies on.
GEMSPEC = Gem::Specification.load("yrb-lite.gemspec")

RbSys::ExtensionTask.new("yrb_lite", GEMSPEC) do |ext|
  ext.lib_dir = "lib/yrb_lite"
end

task default: %i[compile test]

desc "Clean build artifacts"
task :clean do
  sh "cargo clean" if File.exist?("Cargo.toml")
  rm_rf "tmp"
  rm_rf "lib/yrb_lite/yrb_lite.bundle"
  rm_rf "lib/yrb_lite/yrb_lite.so"
end
