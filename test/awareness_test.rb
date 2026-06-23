# frozen_string_literal: true

require "test_helper"
require_relative "fixtures/yjs_fixtures"

# YrbLite::Awareness holds local presence state and acts as the protocol codec
# the ActionCable concern routes frames through. It deliberately does NOT mirror
# the document API (apply_update, sync steps, state vectors) -- that lives on
# YrbLite::Doc; the concern operates on a Doc for document state and uses
# Awareness only for presence + frame classification.
class AwarenessTest < Minitest::Test
  def test_awareness_creation
    awareness = YrbLite::Awareness.new

    assert_instance_of YrbLite::Awareness, awareness
  end

  def test_local_state_round_trips_and_clears
    awareness = YrbLite::Awareness.new

    assert_nil awareness.local_state

    awareness.set_local_state('{"user": "test"}')
    state = awareness.local_state

    assert_kind_of String, state
    assert_includes state, "user"

    awareness.clear_local_state

    assert_nil awareness.local_state
  end

  def test_encode_awareness_update
    awareness = YrbLite::Awareness.new
    awareness.set_local_state('{"cursor": {"x": 10, "y": 20}}')

    update = awareness.encode_awareness_update

    assert_kind_of String, update
    refute_empty update
  end

  def test_encode_update_wraps_bytes_in_a_relayable_frame
    codec = YrbLite::Awareness.new
    encoded = codec.encode_update(YjsFixtures::TwoDocsMerged::DOC1_UPDATE)

    assert_kind_of String, encoded
    refute_empty encoded
  end

  def test_message_kind_and_update_extraction
    codec = YrbLite::Awareness.new
    frame = codec.encode_update(YjsFixtures::TwoDocsMerged::DOC1_UPDATE)

    assert_equal 2, codec.message_kind(frame), "an update frame classifies as a document update"
    refute_nil codec.update_from_message(frame), "the document delta is extractable"
  end

  def test_constants
    assert_equal 0, YrbLite::MSG_SYNC
    assert_equal 1, YrbLite::MSG_AWARENESS
    assert_equal 2, YrbLite::MSG_AUTH
    assert_equal 3, YrbLite::MSG_QUERY_AWARENESS
    assert_equal 0, YrbLite::MSG_SYNC_STEP1
    assert_equal 1, YrbLite::MSG_SYNC_STEP2
    assert_equal 2, YrbLite::MSG_SYNC_UPDATE
  end
end
