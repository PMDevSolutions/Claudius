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
- `<claudius-chat>` gains `voice`, `voice-mode`, `voice-auto-submit`,
  `voice-input`, and `voice-output`. Unlike attachment limits these are plain
  enums and booleans, and the web component cannot read `ClaudiusConfig`, so
  without them "configurable per widget" would not hold for that embed style.
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
| `utils/voice.ts` | `resolveVoiceConfig`, `resolveSpeechLang`, `joinDictation`, `chunkSpeechText`, `pickVoice`. Pure. |
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
  per session is what a chat message needs. If the engine ends the session
  during a pause, pressing the mic again appends.
- Dictation **appends** to whatever is already typed. The field value at
  `start()` is the base; each result renders `joinDictation(base, transcript)`
  clipped to the existing 2000 character limit.
- **Typing takes over.** A manual edit while listening keeps the edited text
  and aborts the session, so a late result cannot overwrite it.
- `isListening` turns true at `start()`, not at the `start` event. That gives
  immediate feedback and guards against a double start while the permission
  prompt is open.
- **Toggle mode:** click starts, click stops. The session also ends by itself
  after the utterance.
- **Hold mode:** pointer down starts and pointer up, cancel, or lost capture
  stops; Space and Enter work the same way from the keyboard. Releasing
  before the engine has actually started calls `abort()` rather than
  `stop()`, so a permission prompt answered after release can never leave the
  microphone open. A `click` with no preceding pointer or key press, which is
  how screen readers and switch devices activate a button, toggles instead,
  so hold mode stays usable without a sustained press.
- **Auto-submit** fires only when the session ended normally and produced
  final text. Never after an error, an abort, or silence. It goes through the
  same submit path as the send button, so pending attachments, the length
  limit, and plugins all apply.
- Starting dictation **cancels any read-aloud** so the microphone does not
  transcribe the widget's own voice.
- Unmounting (closing the chat) aborts the session.

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
- The text is split at sentence boundaries into chunks of at most 200
  characters and queued as separate utterances. That avoids Chrome's
  15-second cutoff and gives clean pause points. Utterances are held in a ref
  because Safari garbage-collects them mid-speech otherwise.
- `pickVoice` prefers a **local** voice for the language, then any voice for
  the language, else leaves the choice to the browser via `utterance.lang`.
  Local voices keep the text on the device and do not have the cutoff bug.
  Android reports `en_US` style tags, so matching normalizes the separator.
- Controls: idle shows Read aloud; speaking shows Pause and Stop; paused
  shows Resume and Stop. Starting another message stops the current one.
- A session counter makes late events from cancelled utterances harmless.
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
| `aborted` | ignored |

The message clears on the next start or edit. Synthesis errors return the
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
  voice picking.
- `useSpeechRecognition`: unsupported no-op, session setup, interim and final
  transcripts, stop versus abort, each error mapping, `start()` throwing,
  double start, unmount.
- `useSpeechSynthesis`: chunk queue with language and voice, state from
  events, pause and resume, the Android pause path, switching messages, stale
  events after cancel, unmount, unsupported no-op.
- Components: visibility rules, both modes by pointer, keyboard, and bare
  click, appending, typing takes over, auto-submit and the cases where it
  must not fire, error display, read-aloud only on settled assistant
  messages, dictation cancels read-aloud.
- Embed attributes, client-config validation, snippets.
- One Playwright spec with injected fakes to prove the wiring in the built
  app. Real engines cannot run in CI: no microphone, and Chromium builds ship
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
