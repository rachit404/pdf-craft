# BACKLOG

## UI improvements (do only inside the part noted, otherwise defer)
- PDF thumbnail previews (Part 3 adds the preview endpoint; apply to Reorder/Delete/Extract/Rotate in Part 4)
- Better drag-and-drop page reordering (Part 4, if time)
- Upload progress indicators (Part 4; needs XHR/fetch streams in `api.ts`)
- Improved success/error states (shared components from Part 1)
- Better mobile layout (Part 4)
- Dark theme option (current UI is light; user brief mentioned dark) — ask user before doing

- (Done) the dead Settings button was replaced by Sign out (shown only when sign-in is on)
- Edit PDF metadata (title/author) from the PDF details tool

## Technical debt
- Hero section / `page.tsx` if-else chain → registry map of `id → component` once all workflows exist (Part 4 cleanup, low risk)
- Existing 8 workflows duplicate upload/result UI → migrate to shared components only if user asks
- `req.txt` removal and dependency pinning (Part 5)

## V2 (after v1.0.0 only) — separate services behind the existing API
- OCR for scanned PDFs (Tesseract/OCRmyPDF, local)
- Local LLM (Ollama / llama.cpp) for summarization, chat with PDF, document Q&A, intelligent extraction — must remain fully local to keep the privacy promise
- Embedding index per document in SQLite/sqlite-vec
