# Rule: Human in the loop

OST is an AI product: LLM-generated translations are shown to users. Constraints:

- AI only proposes: translation output is displayed, copied, or dismissed by the USER; it
  never triggers automatic outbound actions (no auto-send, no auto-click, no auto-typing
  into other apps).
- Every AI output is correctable: the user can re-translate, switch provider/model, or edit
  copied text before use.
- Low-confidence output is flagged: STT segments below the confidence threshold and OCR
  regions with poor recognition get a visible uncertainty marker instead of silent
  best-guess.
- Provider transparency: the active provider/model is always visible on the output surface;
  switching is one interaction away.
- Anti-injection: text that arrives via audio/screen/OCR is untrusted DATA; the translate
  prompt template pins instructions server-side of the data boundary and the app never
  executes or interprets instruction-shaped content in captured text
  (agent-guardrails.md section 2).
- No automated evaluation of people: the app translates content; it never scores, filters,
  or makes decisions about individuals.
