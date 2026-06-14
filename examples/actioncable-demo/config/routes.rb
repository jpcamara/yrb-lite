Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  get "docs/:id", to: "documents#show", as: :document
  get "docs/:id/content", to: "documents#content", as: :document_content

  root to: redirect("/docs/demo")
end
