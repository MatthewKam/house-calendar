import { useEffect, useRef, useState } from 'react';
import { Pic } from '../learn/art';
import { noiseUrl, play, setRecorded } from '../learn/sound';
import { ANIMALS } from '../learn/things';
import { useLearnSounds, useSetLearnSound } from '../../lib/queries';
import s from '../../styles/Settings.module.css';

/** Longest a recording runs before it stops by itself. */
const MAX_MS = 4000;
/** What this browser records in: Safari makes audio/mp4, most others audio/webm. */
const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

/**
 * The games' animal noises, which a grown-up can record in their own voice ("Moo!"): each animal's
 * noise to hear, a button to record over it (up to 4 seconds, or tap again to stop), and a way back to
 * the built-in one.
 */
export default function LearnSounds() {
  const sounds = useLearnSounds().data ?? [];
  const save = useSetLearnSound();
  const [recording, setRecording] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setRecorded(sounds), [sounds]);
  // Leaving Settings mid-recording stops it (and lets go of the microphone).
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  async function record(animal: string) {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setProblem(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("Sprig can't use the microphone. Allow it in the browser's settings, then try again.");
      return;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      clearTimeout(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      setRecording(null);
      const audio = new Blob(parts, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (audio.size) save.mutate({ animal, audio }, { onSuccess: () => play(URL.createObjectURL(audio)) });
    };
    recorder.current = rec;
    rec.start();
    setRecording(animal);
    timer.current = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_MS);
  }

  const own = new Set(sounds.map((x) => x.animal));
  return (
    <div className={s.bare}>
      <p className={s.hint}>
        The animals' noises in the games. Record your own ("Moo!") and the kids hear you instead. Tap ● to start, and again to stop
        (it stops by itself after 4 seconds).
      </p>
      <div className={s.soundList}>
        {ANIMALS.map((a) => {
          const url = noiseUrl(a.id);
          const now = recording === a.id;
          return (
            <div key={a.id} className={s.soundRow}>
              <Pic id={a.id} className={s.soundPic} />
              <span className={s.soundName}>
                {a.name[0].toUpperCase() + a.name.slice(1)}
                <small>{own.has(a.id) ? 'Your recording' : 'Built-in'}</small>
              </span>
              <button type="button" className={s.learnStep} disabled={!url || !!recording} onClick={() => url && play(url)}
                aria-label={`Hear the ${a.name}`}>▶</button>
              <button type="button" className={`${s.learnStep} ${now ? s.recording : s.recordDot}`} disabled={(!!recording && !now) || save.isPending}
                onClick={() => record(a.id)} aria-label={now ? 'Stop recording' : `Record the ${a.name}`}>{now ? '■' : '●'}</button>
              {own.has(a.id) && (
                <button type="button" className={s.textLink} disabled={!!recording || save.isPending}
                  onClick={() => save.mutate({ animal: a.id, audio: null })}>Use built-in</button>
              )}
            </div>
          );
        })}
      </div>
      {problem && <p className={s.error}>{problem}</p>}
      {save.isError && <p className={s.error}>{save.error.message}</p>}
    </div>
  );
}
