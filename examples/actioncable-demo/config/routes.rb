Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  get "docs/:id", to: "documents#show", as: :document
  get "docs/:id/lexxy", to: "documents#lexxy", as: :document_lexxy
  # "Opaque state" demos: the same DocumentChannel, different Yjs shapes.
  get "docs/:id/codemirror", to: "documents#codemirror", as: :document_codemirror
  get "docs/:id/whiteboard", to: "documents#whiteboard", as: :document_whiteboard
  get "docs/:id/kanban", to: "documents#kanban", as: :document_kanban
  get "docs/:id/forms", to: "documents#forms", as: :document_forms
  get "docs/:id/content", to: "documents#content", as: :document_content
  get "docs/:id/audit", to: "documents#audit", as: :document_audit
  post "docs/:id/audit/control", to: "documents#audit_control", as: :document_audit_control

  root to: redirect("/docs/demo")
end
