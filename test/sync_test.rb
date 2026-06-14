# frozen_string_literal: true

require "test_helper"
require_relative "fixtures/yjs_fixtures"
require "yrb_lite/sync"

class SyncTest < Minitest::Test
  class SyncHelper
    include YrbLite::Sync
  end

  def setup
    @helper = SyncHelper.new
    YrbLite::Sync.reset!
  end

  def test_awareness_for_returns_same_instance_for_same_key
    a1 = YrbLite::Sync.awareness_for("test-room")
    a2 = YrbLite::Sync.awareness_for("test-room")

    assert_same a1, a2
  end

  def test_awareness_for_different_keys
    a1 = YrbLite::Sync.awareness_for("room-1")
    a2 = YrbLite::Sync.awareness_for("room-2")

    refute_same a1, a2
  end

  def test_awareness_for_applies_on_load_state_once
    source = YrbLite::Doc.new
    target = YrbLite::Doc.new
    source.apply_update(YjsFixtures::TwoDocsMerged::DOC1_UPDATE)
    state = source.encode_state_as_update

    calls = 0
    loader = lambda do |key|
      calls += 1
      assert_equal "loaded-room", key
      state
    end

    awareness = YrbLite::Sync.awareness_for("loaded-room", loader)
    YrbLite::Sync.awareness_for("loaded-room", loader)

    assert_equal 1, calls, "on_load should run once per key"
    target.apply_update(awareness.encode_state_as_update)
    assert_equal source.encode_state_vector, target.encode_state_vector
  end

  def test_awareness_for_is_thread_safe_on_creation
    instances = 16.times.map do
      Thread.new { YrbLite::Sync.awareness_for("contended-room") }
    end.map(&:value)

    assert_equal 1, instances.uniq(&:object_id).length,
                 "Concurrent subscribers must share one document"
  end

  def test_reset_clears_registry
    YrbLite::Sync.awareness_for("room-1")
    refute_empty YrbLite::Sync.registry

    YrbLite::Sync.reset!

    assert_empty YrbLite::Sync.registry
  end

  def test_broadcast_classification
    sync_step1 = "\x00\x00\x01\x00".b
    sync_step2 = "\x00\x01\x01\x00".b
    sync_update = "\x00\x02\x01\x00".b
    awareness_update = "\x01\x01\x00".b
    query_awareness = "\x03".b

    refute @helper.send(:sync_broadcast?, sync_step1), "SyncStep1 is addressed to the server"
    assert @helper.send(:sync_broadcast?, sync_step2)
    assert @helper.send(:sync_broadcast?, sync_update)
    assert @helper.send(:sync_broadcast?, awareness_update)
    refute @helper.send(:sync_broadcast?, query_awareness)

    refute @helper.send(:sync_modifies_doc?, sync_step1)
    assert @helper.send(:sync_modifies_doc?, sync_step2)
    assert @helper.send(:sync_modifies_doc?, sync_update)
    refute @helper.send(:sync_modifies_doc?, awareness_update)
  end

  def test_handle_sync_message_returns_tuple
    doc = YrbLite::Doc.new

    # Create a SyncStep1 message from another doc
    other_doc = YrbLite::Doc.new
    sync_step1 = other_doc.sync_step1

    result = doc.handle_sync_message(sync_step1)

    # Should return [msg_type, sync_type, response]
    assert result.is_a?(Array)
    assert_equal 3, result.length
    assert_equal 0, result[0] # MSG_SYNC
    assert_equal 0, result[1] # Responding to STEP1
    assert result[2].is_a?(String) # Response bytes (SyncStep2)
  end
end
