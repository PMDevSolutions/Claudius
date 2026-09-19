---
title: Voice
description: Let visitors dictate messages and have replies read aloud, and understand where the audio goes.
sidebar:
  order: 8
---

Voice adds two controls, both built on the browser's
[Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API):

- A **mic button** in the composer. Visitors dictate instead of typing, and
  the words appear in the message field as they speak.
- A **read-aloud button** under each completed assistant reply, with pause and
  stop.

Voice is **off by default**. Each half appears only in browsers that support
it, so enabling voice is safe everywhere: an unsupported browser simply shows
the normal text chat. Nothing changes on the worker.

Read [Privacy posture](#privacy-posture) before you switch it on. The widget
never touches audio, but most browsers send it to their vendor for
recognition, and your privacy policy may need to say so.

## Enable voice

```tsx
<ChatWidget apiUrl="https://your-worker.workers.dev" voice />
```

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    voice: true,
  };
</script>
```

```html
<claudius-chat api-url="https://your-worker.workers.dev" voice></claudius-chat>
```

`true` turns on both the mic and read-aloud. Pass an object to tune them:

| Option | Default | Description |
|--------|---------|-------------|
| `input` | `true` | Show the mic button |
| `output` | `true` | Show the read-aloud button on assistant replies |
| `mode` | `"toggle"` | `"toggle"`: click to start, click again to stop. `"hold"`: record only while the button is held |
| `autoSubmit` | `false` | Send the message as soon as dictation ends |
| `lang` | from the widget locale | BCP-47 tag for recognition and playback, e.g. `"en-GB"`. See [Language](#language) |

```tsx
<ChatWidget
  apiUrl="…"
  voice={{ mode: "hold", autoSubmit: true, output: false }}
/>
```

The web component takes the same options as attributes:

| Attribute | Example |
|-----------|---------|
| `voice` | `voice` or `voice="true"` to enable, `voice="false"` to disable |
| `voice-mode` | `voice-mode="hold"` |
| `voice-auto-submit` | `voice-auto-submit` or `voice-auto-submit="false"` |
| `voice-input` | `voice-input="false"` for read-aloud only |
| `voice-output` | `voice-output="false"` for dictation only |
| `voice-lang` | `voice-lang="en-GB"` |

In a [client config](/configuration/clients/), set `widget.voice` to `true` or
to the same object; `pnpm claudius snippet` carries it into both embed styles.

## Dictation

Dictated text is **appended** to whatever is already in the field, so a
visitor can type part of a message and speak the rest. Recognition stops by
itself at the end of a sentence; pressing the mic again adds more. If the
visitor types while the mic is listening, typing wins: their edit is kept and
the session ends, so a late result can never overwrite it.

Without `autoSubmit`, the text stays in the field to be checked and sent by
hand. Speech recognition makes mistakes, which is why this is the default.
With `autoSubmit`, the message goes out when dictation ends, but only if the
session finished normally and actually heard something. It never fires after
an error or a silent session. It uses the same path as the send button, so
pending [attachments](/configuration/attachments/), the length limit, and
[plugins](/plugins/) all apply.

Starting dictation stops any reply that is being read aloud, so the
microphone does not transcribe the widget's own voice.

### Toggle or hold

`"toggle"` is the default and the more accessible choice, because it needs no
sustained press. While listening, the button shows a stop icon.

`"hold"` is push-to-talk: recording runs from press to release, with a mouse,
a finger, or Space / Enter on the keyboard. If the visitor lets go before the
browser's permission prompt has been answered, nothing starts, so granting
permission afterwards can never open the microphone with nobody at the
button. Screen readers and switch devices activate buttons with a click they
cannot hold, so in hold mode a click of that kind toggles instead.

### Listening indicator

While the mic is open, animated bars appear inside the message field and the
placeholder reads "Listening...". The bars idle while the mic waits and liven
up while speech is being heard.

They show **voice activity, not loudness**. The Web Speech API gives a page no
access to the audio signal. A true level meter would mean opening the
microphone a second time through `getUserMedia`, which conflicts with the
recognizer on Android and iOS, prompts for permission twice in Safari, and
would hand raw audio to the widget. Claudius deliberately does not do that:
see the first point under [Privacy posture](#privacy-posture).

With `prefers-reduced-motion`, the bars hold still and the two states differ
in opacity only.

## Read aloud

The button appears once a reply has finished streaming. Formatting marks are
not spoken and links are shortened to their hostname, the same cleanup used
for screen-reader announcements. One reply plays at a time; starting another
stops the first, and closing the chat stops playback.

Long replies are queued sentence by sentence. Chrome cuts a single long
utterance off after about 15 seconds when it is using a network voice, and
short utterances avoid that.

On **Android**, browsers implement "pause" as "stop". Claudius detects this
and returns the control to its idle state, rather than carrying on with the
next sentence after the visitor pressed pause.

## Language

Recognition and playback use one BCP-47 language tag, chosen in this order:

1. `voice.lang`, when you set it.
2. The page's `<html lang>`, if it names a region of the widget's language.
   An English widget on an `en-GB` page listens for, and speaks, British
   English.
3. The browser's language, under the same rule.
4. A default for the widget [locale](/configuration/localization/):

| Locale | Default speech language |
|--------|-------------------------|
| `en` | `en-US` |
| `es` | `es-ES` |
| `fr` | `fr-FR` |
| `de` | `de-DE` |

Tags in a different language from the widget are ignored, so a French browser
visiting a Spanish widget still gets `es-ES`. Set `voice.lang` for anything
more specific, such as `es-MX` or `pt-BR`.

## Browser support

| Browser | Dictation | Read aloud | Notes |
|---------|-----------|------------|-------|
| Chrome, desktop and Android | Yes | Yes | Needs a network connection |
| Edge | Yes | Yes | |
| Safari 14.1+ on macOS, 14.5+ on iOS and iPadOS | Yes | Yes | The visitor must have Siri enabled in system settings |
| Firefox | No | Yes | Recognition exists only behind a flag. The mic is hidden; read-aloud works |
| Brave, and many in-app browsers | No | Varies | They expose the API but cannot reach a speech service. The mic appears, and using it shows "Voice input is not available right now." |
| Android WebView | Varies | No | |

Dictation also requires a secure page (HTTPS, or `localhost` in development).

### Voices

Claudius does not pick a voice. It sets the language and lets the browser
choose, because the available voices depend on the visitor's browser *and*
operating system, and the browser's own choice is the most reliable one:

| Browser | Where voices come from |
|---------|------------------------|
| Chrome (desktop) | The operating system's voices, plus Google network voices for about 20 languages |
| Edge | The operating system's voices, plus Microsoft's online "Natural" voices |
| Safari, and every browser on iOS | Apple's system voices |
| Firefox | The operating system's voices |
| Chrome (Android) | The device's text-to-speech engine, usually Google's |

To see exactly what a given browser offers, run this in its console:

```js
speechSynthesis.getVoices().map((v) => `${v.name} (${v.lang})${v.localService ? "" : " - network"}`);
```

Chrome loads the list asynchronously, so run it twice if the first result is
empty. A desktop with no voices installed at all, which is common on Linux,
produces no sound: the button returns to idle straight away.

## Privacy posture

What Claudius does, and does not do:

- **The widget never handles audio.** It does not call `getUserMedia`, never
  sees a sample of sound, and cannot record. The browser listens, and gives
  the widget text, exactly as if it had been typed.
- **No audio reaches your worker or Anthropic.** Only the resulting text is
  sent, and only when the message is sent.
- **Nothing is on unless you enable it**, and the microphone opens only while
  the visitor is pressing or has toggled the mic button. Closing the chat or
  leaving the page ends the session.

What the browser does is outside Claudius's control, and it is **not
on-device in most browsers**:

| Browser | Where speech is recognized |
|---------|----------------------------|
| Chrome | Google's servers. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API): "Your audio is sent to a web service for recognition processing" |
| Edge | The browser vendor's speech service |
| Safari | The same engine as Siri. Apple does not say whether a given request is handled on the device or on its servers, so treat it as leaving the device |

Read-aloud is similar in one case: when Chrome or Edge choose a **network
voice**, the text of the reply is sent to Google or Microsoft to be
synthesized. System voices are generated on the device. The console snippet
under [Voices](#voices) marks which is which.

If you enable voice, say so in your privacy policy: that dictation is
processed by the visitor's browser vendor, and name the vendors above. The
browser asks the visitor for microphone permission itself, the first time
they use the mic.

On-device recognition exists (`SpeechRecognition.processLocally`, in desktop
Chrome 139 and later) but is experimental, is unavailable on Android, Safari,
and Firefox, and requires downloading a language pack first. Claudius does not
use it yet.

### Site policies that block the microphone

- A `Permissions-Policy: microphone=()` header disables dictation. Allow your
  own origin: `Permissions-Policy: microphone=(self)`.
- If the page hosting the widget is itself inside an `<iframe>`, that frame
  needs `allow="microphone"`.

In both cases the visitor sees "Microphone access is blocked."

## Customizing the text

Every voice string can be [translated or overridden](/configuration/localization/):
`voiceInput`, `voiceInputHold`, `voiceListening`, `voicePermissionDenied`,
`voiceNoSpeech`, `voiceNoMicrophone`, `voiceUnavailable`, `readAloud`,
`pauseReading`, `resumeReading`, and `stopReading`. English, Spanish, French,
and German ship built in.
