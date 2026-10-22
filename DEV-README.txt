MKnote - dev migration pack
===========================

New machine:
  Node.js 18.14+ or 20 LTS
  Rust (rustup)
  Windows: VS Build Tools (Desktop development with C++)
  WebView2

After extract:
  cd <project folder>
  npm install
  npm run tauri dev

Not included (rebuild on new machine):
  node_modules/
  src-tauri/target/
  dist/
  portable/

Optional user data:
  %AppData%\md-sticky-note\config.json
  your notes folder

Rebuild this zip:
  npm run pack:dev

Agent / handover (read first):
  docs/AGENT-HANDOVER.md
  docs/MKnote-UI-v2.md
  AGENTS.md
