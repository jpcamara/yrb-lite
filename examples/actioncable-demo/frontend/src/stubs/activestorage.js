// Stub for @rails/activestorage. Lexxy dynamically imports it for attachment
// uploads, which this collaboration demo doesn't exercise, so DirectUpload is a
// no-op. Keeps the bundle self-contained without an ActiveStorage setup.
export class DirectUpload {
  constructor() {}
  create(cb) {
    if (cb) cb(new Error("activestorage disabled in this demo"))
  }
}
