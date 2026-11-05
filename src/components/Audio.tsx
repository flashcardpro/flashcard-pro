import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useMediaUrl, primeMediaUrl } from '../lib/media';
import { addMediaBlob } from '../lib/store';
import { useT } from '../lib/i18n';
import { Button, IconButton } from './ui';
import { toast } from 'sonner';

export function AudioPlay({ mediaId, autoPlay = false, small = false }: { mediaId: string; autoPlay?: boolean; small?: boolean }) {
  const t = useT();
  const url = useMediaUrl(mediaId);
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    ref.current = a;
    a.onended = () => setPlaying(false);
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    if (autoPlay) a.play().catch(() => {});
    return () => {
      a.pause();
      ref.current = null;
    };
  }, [url, autoPlay]);
  return (
    <IconButton
      label={playing ? t('Pause voice note') : t('Play voice note')}
      className={small ? 'icon-btn-sm' : ''}
      onClick={(e) => {
        e.stopPropagation();
        const a = ref.current;
        if (!a) return;
        if (a.paused) {
          a.currentTime = 0;
          a.play().catch(() => {});
        } else a.pause();
      }}
      disabled={!url}
    >
      {playing ? <Pause size={16} /> : <Play size={16} />}
    </IconButton>
  );
}

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of types) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

/** Record a short voice note (max 2 minutes) and attach it to one side of a card. */
export function AudioRecorder({ value, onChange, label }: { value: string | null; onChange: (id: string | null) => void; label: string }) {
  const t = useT();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => stopAll(), []);
  function stopAll() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error(t('This browser cannot record audio.'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        stopAll();
        const blob = new Blob(chunks.current, { type: (r.mimeType || 'audio/webm').split(';')[0] });
        if (blob.size < 500) return;
        const meta = await addMediaBlob(blob, { name: 'voice-note' });
        primeMediaUrl(meta.id, blob);
        onChange(meta.id);
      };
      r.start();
      setRec(r);
      setSecs(0);
      timer.current = setInterval(() => {
        setSecs((s) => {
          if (s + 1 >= 120) r.state === 'recording' && r.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error(t('Microphone access was blocked. Allow it in your browser settings to record.'));
    }
  }

  function stop() {
    rec?.state === 'recording' && rec.stop();
    setRec(null);
  }

  if (rec) {
    return (
      <div className="recorder is-recording">
        <span className="rec-dot" />
        <span className="rec-time">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </span>
        <Button size="sm" variant="danger" icon={<Square size={14} />} onClick={stop}>
          {t('Stop')}
        </Button>
      </div>
    );
  }
  return (
    <div className="recorder">
      {value ? (
        <>
          <AudioPlay mediaId={value} />
          <span className="recorder-label">{label}</span>
          <IconButton label={t('Remove voice note')} onClick={() => onChange(null)}>
            <Trash2 size={16} />
          </IconButton>
          <Button size="sm" variant="ghost" icon={<Mic size={14} />} onClick={start}>
            {t('Re-record')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" icon={<Mic size={15} />} onClick={start}>
          {label}
        </Button>
      )}
    </div>
  );
}
