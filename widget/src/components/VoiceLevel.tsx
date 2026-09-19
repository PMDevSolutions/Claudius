interface VoiceLevelProps {
  /** True while the recognizer reports hearing speech. */
  active: boolean;
}

/**
 * Listening indicator shown inside the message field while dictating: bars
 * that idle while the mic waits and liven up while speech is heard. It shows
 * voice activity, not loudness. The Web Speech API exposes no audio signal,
 * and metering one ourselves would mean opening the microphone a second time.
 */
export function VoiceLevel({ active }: VoiceLevelProps) {
  return (
    <span
      aria-hidden="true"
      data-claudius-voice-level={active ? "active" : "idle"}
      className="claudius-voice-level pointer-events-none absolute right-3 top-1/2 flex h-4 -translate-y-1/2 items-center gap-0.5 text-claudius-accent"
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
