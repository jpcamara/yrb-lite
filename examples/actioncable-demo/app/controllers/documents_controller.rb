# frozen_string_literal: true

class DocumentsController < ApplicationController
  # The collaborative editor page.
  def show
    @document_id = params[:id]
  end

  # Server-side read of the live document — ProseMirror JSON extracted
  # natively from the CRDT, no JavaScript involved. Open in another tab
  # while editing to watch it change.
  def content
    awareness = YrbLite::Sync.registry[params[:id]]
    return render json: { error: "No such document" }, status: :not_found unless awareness

    render json: YrbLite::ProseMirrorExtractor.extract(awareness.encode_state_as_update)
  rescue RuntimeError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
