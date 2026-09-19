# Voice input and text-to-speech playback: design

Issue: [#54](https://github.com/PMDevSolutions/Claudius/issues/54)
Date: 2026-09-18
Status: implemented in the same PR as this document

## Summary

Add an opt-in `voice` option to the widget. It puts a mic button in the
composer that dictates into the message field through the browser's
`SpeechRecognition`, and a read-aloud control under each completed assistant
message that plays it through `speechSynthesis`. Both halves are feature
detected independently and render nothing where the browser lacks them.

The feature is widget-only. No worker, API, or wire-format change.

## Facts that constrain the design

These were checked against MDN and the MDN browser-compat data on 2026-09-18,
because several of them contradict common assumptions (including one in the
issue).

1. **Recognition audio usually leaves the device.** MDN: "By default, using
   speech recognition on a web page involves a server-based recognition
   engine. Your audio is sent to a web service for recognition processing."
   Chrome sends audio to Google, Safari hands it to Apple's dictation service.
   The issue's acceptance criterion ("speech is processed on-device by the
   browser; no audio leaves the client") is therefore **not true** and must
   not be documented as written. What *is* true, and what we document: the
   widget never requests microphone access itself, never sees audio, and
   never sends audio to the Claudius worker. It receives text from the
   browser, exactly as if it had been typed.
2. **On-device recognition exists but is not ready to build on.**
   `SpeechRecognition.processLocally` shipped in desktop Chrome 139. It is
   marked experimental, is unsupported on Chrome for Android, Safari, and
   Firefox, needs a language-pack download flow (`available()` /
   `install()`), and has open bugs where `available()` hangs. Out of scope
   here; listed under follow-ups.
3. **The API exposes no audio signal.** There is no level, waveform, or
   sample access. A true amplitude meter needs a second microphone capture
   through `getUserMedia` plus a Web Audio `AnalyserNode`.
4. **Support matrix.** Recognition: Chrome and Edge 33+ (prefixed; unprefixed
   from 139), Safari 14.1+ and iOS Safari 14.5+ (prefixed), Firefox only
   behind a flag. Synthesis: every current browser except Android WebView.
   Some Chromium forks (Brave, some in-app browsers) expose the constructor
   but fail at `start()` with a `network` or `service-not-allowed` error, so
   detection alone is not enough: start-time errors need a visible message.
5. **`speechSynthesis.pause()` is `cancel()` on Android.** Compat data: "In
   Android, `pause()` ends the current utterance."
6. **Chrome cuts long utterances off** at roughly 15 seconds when a network
   voice is used, and then fires no `end` event.
7. **Network voices send the text being read to the voice vendor.**
   `SpeechSynthesisVoice.localService` distinguishes them.

## Approaches considered

**A. Two small hooks over the browser APIs, no dependencies (chosen).**
`useSpeechRecognition` and `useSpeechSynthesis` wrap the platform, pure
helpers hold the logic worth unit testing, and the UI stays thin. Smallest
bundle cost, no global state, works with multiple widget instances.

**B. A library** (`react-speech-recognition`, `react-speech-kit`). Rejected:
more bytes than writing it directly, singleton state that fights multiple
instances, and nothing for the Android pause or 15-second problems.

**C. Server-side STT/TTS through the worker.** Would cover Firefox, but sends
audio to our worker, which is the opposite of the privacy goal, and adds
cost, latency, and a large worker surface. Rejected for this issue.

## Public API

```ts
type VoiceInputMode = "toggle" | "hold";

interface VoiceOptions {
  input?: boolean;        // mic button. Default true
  output?: boolean;       // read-aloud control. Default true
  mode?: VoiceInputMode;  // Default "toggle"
  autoSubmit?: boolean;   // send when dictation ends. Default false
  lang?: string;          // BCP-47. Default: derived from the widget locale
}

// ChatWidgetProps / window.ClaudiusConfig
voice?: boolean | VoiceOptions; // Default false
```

- **Off by default**, like `attachments`. A minor release must not add a
  microphone button to every existing embed, and turning it on has privacy
  implications the site owner should choose deliberately.
- `voice: true` enables both halves. `output: false` makes the speaker
  optional, as the issue asks. `input: false` gives a read-aloud-only widget.
  Both `false` resolves to disabled.
- An unknown `mode` falls back to `"toggle"` rather than throwing, since it
  can arrive from an HTML attribute.
- The option **fails closed**: only `true` or an options object enables it.
  The string `"false"` from a CMS template is truthy, and must not switch a
  microphone on.
- `<claudius-chat>` gains `voice`, `voice-mode`, `voice-auto-submit`,
  `voice-input`, `voice-output`, and `voice-lang`. Unlike attachment limits
  these are plain enums, booleans, and strings, and the web component cannot
  read `ClaudiusConfig`, so without them "configurable per widget" would not
  hold for that embed style.
- `clients/_schema.json`, CLI validation, and both snippet generators accept
  `widget.voice`.

### Language

`resolveSpeechLang(locale, override)` returns, in order:

1. `voice.lang` when set.
2. `<html lang>` when it carries a region and its primary subtag matches the
   widget locale (`en-GB` on an English widget).
3. `navigator.language` under the same rule.
4. A default per built-in locale: `en-US`, `es-ES`, `fr-FR`, `de-DE`.

Steps 2 and 3 mirror `detectLocale()` and mean a UK site gets British
recognition and a British voice with no configuration. With nothing
detectable the result is `en-US`, as the issue specifies.

## Architecture

```
ChatWidget   resolveVoiceConfig(voice, locale ?? detectLocale())
  ChatWindow   useSpeechSynthesis(lang)            one reader per window
    ChatMessage  <MessageSpeechControls>           completed assistant messages
    ChatInput    useSpeechRecognition(lang)
                 <VoiceInputButton>  <VoiceLevel>
```

| Unit | Responsibility |
|------|----------------|
| `utils/voice.ts` | `resolveVoiceConfig`, `resolveSpeechLang`, `joinDictation`, `chunkSpeechText`, `voiceOptionsFromAttributes`. Pure. |
| `hooks/useSpeechRecognition.ts` | One recognition session at a time: start, stop, abort, transcript, error mapping. Minimal local typings, since TypeScript's DOM lib has none for recognition. |
| `hooks/useSpeechSynthesis.ts` | Reads one message at a time: chunk queue, pause, resume, cancel. |
| `components/VoiceInputButton.tsx` | The mic button and its toggle / hold gesture handling. Presentational. |
| `components/VoiceLevel.tsx` | The listening indicator. Presentational. |
| `components/MessageSpeechControls.tsx` | Read aloud / pause / resume / stop buttons. Presentational. |

`ChatInput` owns the recognition hook because the transcript has to land in
its controlled field. `ChatWindow` owns the synthesis hook because only one
message may speak at a time and it already holds `streamingMessageId`.

## Behavior

### Dictation

- A **new recognition instance per session**, created in `start()`. Reusing
  one after an error is unreliable in Safari.
- `interimResults = true` so words appear in the field as they are spoken.
  `continuous = false` in both modes. Continuous mode duplicates results on
  Chrome for Android and misreports `isFinal` in Safari; a single utterance
  per session is what a chat message needs. In toggle mode, if the engine
  ends the session during a pause, pressing the mic again appends. Hold mode
  bridges the pause itself (below).
- Dictation **appends** to whatever is already typed. The field value at
  `start()` is the base; each result renders `joinDictation(base, transcript)`
  clipped to the existing 2000 character limit.
- **Typing takes over.** A manual edit while listening keeps the edited text
  and aborts the session, so a late result cannot overwrite it.
- `isListening` turns true at `start()`, not at the `start` event. That gives
  immediate feedback and guards against a double start while the permission
  prompt is open.
- **Toggle mode:** click starts, click stops. The session also ends by itself
  after the utterance. While listening the button shows a stop square, the
  same swap the send button makes while a reply streams. A solid mic next to
  the solid send button read as two send buttons.
- The field is kept scrolled to its end while dictating. It is not focused,
  so the browser does not scroll it, and a long dictation would otherwise show
  only its first words.
- **Hold mode:** pointer down starts and pointer up, cancel, or lost capture
  stops; Space and Enter work the same way from the keyboard. Releasing
  before the engine has actually started calls `abort()` rather than
  `stop()`, so a permission prompt answered after release can never leave the
  microphone open. A `click` with no click count, which is how screen readers
  and switch devices activate a button, toggles instead, so hold mode stays
  usable without a sustained press.
- **A hold is one dictation spanning several engine sessions.** With
  `continuous = false` the engine ends a session at the first pause in
  speech, which would silently drop whatever the visitor says next with the
  button still down. So when a session ends mid-hold after hearing something,
  `ChatInput` opens another and keeps appending. A session that heard nothing
  is not replaced, so an engine that ends immediately cannot spin. Only a
  real hold is bridged this way: a toggle start has no guaranteed release, so
  bridging it could leave the microphone open indefinitely. The button tells
  its parent which it was (`onStart({ held })`).
- `start()` and `stop()` report whether they did anything. A press while the
  previous session is still winding down is refused, and must not move the
  dictation base: that session's final result is still to arrive against the
  old base, and re-basing would duplicate the text. When it then ends with
  the button down again, the bridge above picks the new hold up.
- **Auto-submit** fires once per dictation, when it ends: never after a real
  error or an abort, and only if something was heard. In hold mode that means
  on release, not at the first pause. A later session of a hold timing out in
  silence (`no-speech`) is not an error, just a visitor who stopped talking
  while still holding; the text heard earlier is still sent on release. It
  goes through the same submit path as the send button, so pending
  attachments, the length limit, and plugins all apply.
- **Dictation and read-aloud end each other**, in both directions, so the
  microphone never transcribes the widget's own voice (which auto-submit
  would then send as the visitor's message).
- A request starting to load also ends dictation. The field is disabled then,
  and an auto-submit would clear text that `useChat` refuses to send.
- Unmounting (closing the chat) aborts the session.
- Defensive against engines that misbehave: an error releases the session
  without waiting for the `end` the spec promises; hearing anything counts as
  "started" for engines that skip the `start` event; and an `aborted` raised
  by the engine itself (another tab took the microphone) ends the dictation
  quietly without running auto-submit.

### Listening indicator

Animated bars sit inside the right edge of the message field while listening,
and the placeholder reads "Listening...". The bars have two states, idle and
active, driven by the engine's `speechstart` / `speechend` events and by
arriving results.

This is a voice-activity indicator, **not an amplitude meter**, and that is a
deliberate deviation from a literal reading of "waveform / level indicator".
A true meter needs the second `getUserMedia` capture described above, which
(a) conflicts with the recognizer's own capture on Android and iOS, the
platforms the issue cares most about, (b) adds a second permission prompt in
Safari, and (c) would give widget code access to raw audio, which would make
the privacy statement in the next section untrue. The indicator still
reflects whether speech is being heard, which is the feedback a user needs.

Under `prefers-reduced-motion` the bars do not animate; the two states differ
in opacity.

### Read aloud

- Offered on assistant messages that have settled (not the streaming one) and
  have text. Nothing plays automatically.
- Text passes through the existing `stripAnnouncementFormatting`, so markdown
  markers are not read out and URLs collapse to hostnames.
- The text is split at sentence boundaries into chunks of at most 150
  characters, about ten seconds of speech, and queued as separate utterances.
  That avoids Chrome's 15-second cutoff, with room for numbers, which take
  far longer to say than to write. Boundaries are newlines, `.` `!` `?`
  followed by whitespace (so "example.com" and "$9.99" do not split), and the
  full-width `。` `！` `？`, which have no space after them. An over-long
  sentence splits between words and an over-long unbroken token is cut, since
  that is what unpunctuated Chinese or Japanese looks like. Utterances are
  held in a ref because Safari garbage-collects them mid-speech otherwise.
- **The voice is left to the browser**: only `utterance.lang` is set. An
  earlier draft picked a local voice explicitly, for privacy and to avoid the
  cutoff. That was dropped. Voice lists are alphabetical, so "first local
  en-US voice" is the novelty voice "Albert" on a Mac whose system language is
  not English; in Edge it would swap the Natural voices for robotic ones; and
  Safari and Firefox voices are all local already, so there was nothing to
  gain there. Chunking already handles the cutoff, and the docs state plainly
  that a network voice sends the reply text to the vendor.
- `speak()` cancels the engine only when something is playing or queued. That
  still clears a queue Chrome left stuck, without sending an idle engine a
  `cancel()` immediately before `speak()`, which swallows the new utterance
  in some browsers. Verified against Chrome 153: with no voices installed
  `speak()` fires `error: synthesis-failed`, which returns the control to
  idle rather than leaving it stuck.
- Controls: idle shows Read aloud; speaking shows Pause and Stop; paused
  shows Resume and Stop. Starting another message stops the current one. The
  first button is a single element that changes role, so keyboard focus
  survives the swap; when Stop disappears with focus on it, focus moves to
  the remaining button. Otherwise focus would fall to `<body>`, outside the
  dialog's focus trap.
- **Pause state comes from the utterance's `pause` / `resume` events**, plus
  the `paused` flag for Firefox, which sets it synchronously. Chrome and
  Safari set the flag only once the engine confirms, so reading it right
  after `pause()` (the first implementation) left the UI on "Pause" with no
  way to resume. Verified against Chrome 153.
- **The engine is a shared global, so the reader only cancels speech it
  started.** A reader that never spoke must not silence the host page when
  the chat closes, which matters even with voice switched off, because the
  hook always mounts. An `interrupted` / `canceled` error with no pause of
  ours pending means another widget or the host page took over: the reader
  forgets its own playback and leaves the engine alone, since cancelling
  again would kill the newcomer's speech.
- Per the spec `cancel()` leaves a paused engine paused, and the next reply
  would queue in silence, so stopping while paused also resumes the engine.
- A run counter makes late events from cancelled utterances harmless.
- **Android pause:** if a chunk ends while a pause was requested and the
  engine does not report `paused`, the platform treated pause as cancel. The
  rest of the queue is cancelled and the control returns to idle, instead of
  the next sentence starting to play after the user pressed pause.

## Errors

Recognition errors map to four translated messages shown in the composer's
existing `role="alert"` slot:

| Engine code | Message |
|-------------|---------|
| `not-allowed`, `service-not-allowed` | Microphone access is blocked |
| `no-speech` | No speech was detected |
| `audio-capture` | No microphone was found |
| `network`, `language-not-supported`, anything else, `start()` throwing | Voice input is unavailable |
| `aborted` | no message |
| `no-speech` on a later session of the same hold | no message |

The message clears on the next start, edit, or send. Synthesis errors return the
control to idle silently; there is nothing useful to tell the user.

## Accessibility

- The mic is a real `button` with a constant label and `aria-pressed`, rather
  than a label that changes with state, to avoid announcing the state twice.
- No live "listening" announcement: a screen reader speaking at that moment
  would be transcribed.
- Indicator bars are `aria-hidden`. State is carried by `aria-pressed` and
  the placeholder.
- Composer button is 44 px like its neighbours; message controls are 28 px,
  above the WCAG 2.5.8 minimum.
- Hold mode has the click fallback described above (WCAG 2.5.1).
- New buttons are picked up by the existing focus trap, which queries
  focusable elements on each Tab.

## Strings

Eleven keys, translated in en, es, fr, and de (the parity test enforces it):
`voiceInput`, `voiceInputHold`, `voiceListening`, `voicePermissionDenied`,
`voiceNoSpeech`, `voiceNoMicrophone`, `voiceUnavailable`, `readAloud`,
`pauseReading`, `resumeReading`, `stopReading`.

## Testing

Test-first, with fake `SpeechRecognition` and `speechSynthesis`
implementations that tests drive event by event.

- `utils/voice`: config resolution, language resolution, joining, chunking,
  attribute parsing.
- `useSpeechRecognition`: unsupported no-op, session setup, interim and final
  transcripts, stop versus abort, each error mapping, `start()` throwing,
  double start, unmount.
- `useSpeechSynthesis`: chunk queue with language, pause state as each
  browser family reports it, the Android pause paths, switching messages,
  stale events after cancel, speech it does not own, unmount, unsupported
  no-op. The fake confirms a pause asynchronously by default, as Chrome and
  Safari do; an earlier fake that set `paused` inside `pause()` hid a real
  bug.
- Components: visibility rules, both modes by pointer, keyboard, and bare
  click, appending, typing takes over, auto-submit and the cases where it
  must not fire, error display, read-aloud only on settled assistant
  messages, dictation cancels read-aloud.
- Embed attributes, client-config validation, snippets.
- One Playwright spec with injected fakes to prove the wiring in a real
  browser, including the one behaviour jsdom cannot show (keeping a long
  dictation scrolled into view). Real engines cannot run in CI: no microphone, and Chromium builds ship
  without the recognition service key.

## Documentation

New `configuration/voice.md`: enabling, options, browser support table, where
voices come from per browser and how to list them, and the privacy posture as
stated under fact 1. Updates to the widget and clients configuration pages,
the FAQ, and `CLAUDE.md`.

## Bundle budget

Everything ships in the main bundle: the IIFE build cannot code-split.
Budgets are raised to measured size plus 5%, in their own commit, per
CONTRIBUTING.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Mic visible only when recognition is supported | Met |
| Hold and toggle modes, configurable per widget | Met, across all three embed styles |
| Inline waveform / level indicator | Met as a voice-activity indicator, not an amplitude meter. See Listening indicator |
| Auto-submit, off by default | Met, as a configuration option |
| Speaker with cancel and pause | Met. Pause degrades to stop on Android, a platform limit |
| Locale follows the widget, `en-US` default; voices documented | Met |
| Documented privacy posture | Met, **with corrected wording**. The issue's claim is inaccurate. See fact 1 |
| Graceful no-op when unsupported | Met |

## Out of scope, possible follow-ups

- `onDevice` option built on `processLocally`, including the language-pack
  install flow, once the API is stable beyond desktop Chrome.
- Opt-in amplitude meter for desktop browsers.
- Auto-reading new replies, voice / rate / pitch selection, read-aloud for
  the welcome message.
