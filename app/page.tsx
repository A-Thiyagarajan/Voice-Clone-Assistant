"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  MdContentCopy,
  MdDarkMode,
  MdDelete,
  MdDownload,
  MdGraphicEq,
  MdLightMode,
  MdMic,
  MdPause,
  MdPlayArrow,
  MdRadioButtonChecked,
  MdRefresh,
  MdReplay,
  MdSave,
  MdShare,
  MdStop
} from "react-icons/md";

type AppStatus = "Idle" | "Listening..." | "Ready" | "Playing";

type VoiceOption = {
  label: string;
  value: string;
  category: string;
  style: string;
};

type HistoryItem = {
  id: string;
  date: string;
  transcript: string;
  originalAudio?: string;
  generatedAudio?: string;
  generatedFormat?: "mp3" | "wav";
  selectedVoice: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onnomatch: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence?: number };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    webkitAudioContext?: typeof AudioContext;
  }
}

const voices: VoiceOption[] = [
  { label: "Male voice", value: "echo", category: "Male", style: "Clear adult male" },
  { label: "Female voice", value: "nova", category: "Female", style: "Warm adult female" },
  { label: "Child voice", value: "shimmer", category: "Character", style: "Bright, youthful, playful" },
  { label: "Deep voice", value: "onyx", category: "Deep", style: "Low, calm, resonant" },
  { label: "Robotic voice", value: "ash", category: "Synthetic", style: "Precise, robotic, lightly synthetic" },
  { label: "Narrator voice", value: "fable", category: "Narrator", style: "Polished audiobook narrator" },
  { label: "Friendly assistant", value: "alloy", category: "Assistant", style: "Friendly assistant" }
];

const languages = [
  { label: "English India", value: "en-IN" },
  { label: "English US", value: "en-US" },
  { label: "English UK", value: "en-GB" },
  { label: "Spanish", value: "es-ES" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
  { label: "Hindi", value: "hi-IN" },
  { label: "Japanese", value: "ja-JP" }
];

const accents = ["Neutral", "American", "British", "Australian", "Indian", "Spanish", "French"];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function fileToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(true);
  const [status, setStatus] = useState<AppStatus>("Idle");
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [voice, setVoice] = useState(voices[6]);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [language, setLanguage] = useState("en-IN");
  const [accent, setAccent] = useState("Neutral");
  const [autoPlayback, setAutoPlayback] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [silenceStop, setSilenceStop] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [recognitionNotice, setRecognitionNotice] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const manualStopRef = useRef(false);
  const instantUnavailableRef = useRef(false);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const voiceRef = useRef(voice);
  const settingsRef = useRef({ speed, pitch, volume, language });

  const words = useMemo(() => transcript.trim().split(/\s+/).filter(Boolean).length, [transcript]);
  const estimatedSpeakingSeconds = Math.max(1, Math.round((words / 150) * 60));
  const characters = transcript.length;
  const hasTranscript = transcript.trim().length > 0;
  const hasRecording = Boolean(originalBlob);
  const statusTone = status === "Listening..." ? "bg-rose-500/15 text-rose-700 dark:text-rose-200" : status === "Playing" ? "bg-teal-500/15 text-teal-800 dark:text-teal-200" : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";

  const persistHistory = useCallback((items: HistoryItem[]) => {
    const next = items.slice(0, 8);
    setHistory(next);
    localStorage.setItem("voice-clone-history", JSON.stringify(next));
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
  }, []);

  const startAudioMeter = useCallback(
    (stream: MediaStream) => {
      stopAudioMeter();
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context = new AudioContextConstructor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      audioContextRef.current = context;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const sample of data) {
          peak = Math.max(peak, Math.abs(sample - 128));
        }
        setMicLevel(Math.min(1, peak / 64));
        meterFrameRef.current = window.requestAnimationFrame(tick);
      };
      tick();
    },
    [stopAudioMeter]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  useEffect(() => {
    voiceRef.current = voice;
    settingsRef.current = { speed, pitch, volume, language };
  }, [language, pitch, speed, voice, volume]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    window.queueMicrotask(() => {
      const saved = localStorage.getItem("voice-clone-history");
      if (saved) setHistory(JSON.parse(saved) as HistoryItem[]);
    });
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
      if (originalAudioUrl) URL.revokeObjectURL(originalAudioUrl);
      stopAudioMeter();
    };
  }, [originalAudioUrl, stopAudioMeter]);

  useEffect(() => {
    const loadVoices = () => setBrowserVoices(window.speechSynthesis?.getVoices() ?? []);
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopAudioMeter();
    setIsRecording(false);
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
  }, [stopAudioMeter]);

  const startBrowserRecognition = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setRecognitionNotice("Recording will work, but this browser does not provide speech-to-text here. You can still play, save, and share the recording.");
      return false;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.onstart = () => setStatus("Listening...");
    recognition.onaudiostart = () => setStatus("Listening...");
    recognition.onspeechstart = () => setStatus("Listening...");
    recognition.onnomatch = () => setRecognitionNotice("Audio was heard, but words were unclear. Try another language option or speak closer to the microphone.");
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      let latestConfidence: number | null = null;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        latestConfidence = typeof result[0].confidence === "number" ? result[0].confidence : latestConfidence;
        if (result.isFinal) finalText += `${text} `;
        else interim += text;
      }

      if (finalText) {
        setRecognitionNotice("");
        setTranscript((current) => {
          const next = `${current}${current.endsWith(" ") || !current ? "" : " "}${finalText}`.trimStart();
          transcriptRef.current = next;
          return next;
        });
      }
      interimTranscriptRef.current = interim;
      setInterimTranscript(interim);
      setConfidence(latestConfidence);

      if (silenceStop) {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = window.setTimeout(() => stopRecording(), 9000);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        setRecognitionNotice("No words detected yet. The recording is still being saved.");
        return;
      }
      setRecognitionNotice(`Speech-to-text is limited here (${event.error}). Your recording will still be saved.`);
    };
    recognition.onend = () => {
      setInterimTranscript("");
      if (isRecordingRef.current && !manualStopRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // Some browsers throw if recognition is already starting.
          }
        }, 180);
      }
    };
    try {
      recognition.start();
    } catch {
      setRecognitionNotice("Speech-to-text could not start here. Your recording will still be saved.");
      return false;
    }
    recognitionRef.current = recognition;
    return true;
  }, [language, silenceStop, stopRecording]);

  const pickBrowserVoice = useCallback(() => {
    if (browserVoices.length === 0) return undefined;
    const { language: activeLanguage } = settingsRef.current;
    const sameLanguage = browserVoices.filter((item) => item.lang.toLowerCase().startsWith(activeLanguage.toLowerCase()));
    const candidates = sameLanguage.length > 0 ? sameLanguage : browserVoices;
    const activeVoice = voiceRef.current;
    const nameHints = {
      echo: ["male", "david", "mark", "alex"],
      nova: ["female", "zira", "susan", "samantha"],
      shimmer: ["female", "zira", "samantha"],
      onyx: ["male", "david", "mark"],
      ash: ["desktop", "system", "google"],
      fable: ["natural", "premium", "online"],
      alloy: ["natural", "google", "zira", "samantha"]
    }[activeVoice.value] ?? [];

    return (
      candidates.find((item) => nameHints.some((hint) => item.name.toLowerCase().includes(hint))) ??
      candidates.find((item) => item.default) ??
      candidates[0]
    );
  }, [browserVoices]);

  const speakWithBrowser = useCallback(
    async (text: string, saveToHistory = false, originalAudio?: Blob | null) => {
      if (!("speechSynthesis" in window)) {
        toast.error("Browser speech playback is not supported here.");
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const activeSettings = settingsRef.current;
      utterance.lang = activeSettings.language;
      utterance.rate = activeSettings.speed;
      utterance.pitch = Math.max(0, Math.min(2, 1 + activeSettings.pitch / 12));
      utterance.volume = activeSettings.volume;
      utterance.voice = pickBrowserVoice() ?? null;
      utterance.onstart = () => setStatus("Playing");
      utterance.onend = () => setStatus("Ready");
      utterance.onerror = () => {
        setStatus("Ready");
        toast.error("Browser voice playback failed.");
      };
      window.speechSynthesis.speak(utterance);

      if (saveToHistory) {
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          transcript: text,
          originalAudio: originalAudio ? await fileToDataUrl(originalAudio) : undefined,
          selectedVoice: `${voiceRef.current.label} (instant browser)`
        };
        persistHistory([item, ...history]);
      }
    },
    [history, persistHistory, pickBrowserVoice]
  );

  const finishInstantRecording = useCallback(
    (blob: Blob) => {
      window.setTimeout(() => {
        const instantTranscript = `${transcriptRef.current} ${interimTranscriptRef.current}`.trim();
        setStatus("Ready");
        if (instantTranscript) {
          setRecognitionNotice("");
          setTranscript(instantTranscript);
          setInterimTranscript("");
          toast.success("Instant transcript ready");
          if (autoPlayback) void speakWithBrowser(instantTranscript, true, blob);
          return;
        }

        setRecognitionNotice("Recording saved. Speech-to-text could not detect clear words, but you can play, save, or share the audio.");
        toast.success("Recording saved");
      }, 1000);
    },
    [autoPlayback, speakWithBrowser]
  );

  const startRecording = async () => {
    try {
      setSeconds(0);
      setStatus("Listening...");
      setTranscript("");
      setInterimTranscript("");
      setConfidence(null);
      setOriginalBlob(null);
      if (originalAudioUrl) URL.revokeObjectURL(originalAudioUrl);
      setOriginalAudioUrl(null);
      setRecognitionNotice("");
      manualStopRef.current = false;
      instantUnavailableRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 }
      });
      streamRef.current = stream;
      startAudioMeter(stream);
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "" });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setOriginalBlob(blob);
        setOriginalAudioUrl(URL.createObjectURL(blob));
        finishInstantRecording(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      if (!startBrowserRecognition()) {
        instantUnavailableRef.current = true;
      }
      setIsRecording(true);
      toast.success("Recording started");
    } catch (error) {
      setStatus("Idle");
      toast.error(error instanceof Error ? error.message : "Microphone permission was denied.");
    }
  };

  const playRecording = () => {
    if (!originalAudioUrl || !audioRef.current) {
      toast.error("Record audio first.");
      return;
    }
    window.speechSynthesis.cancel();
    audioRef.current.src = originalAudioUrl;
    audioRef.current.volume = volume;
    audioRef.current.currentTime = 0;
    audioRef.current.onplay = () => setStatus("Playing");
    audioRef.current.onended = () => setStatus("Ready");
    void audioRef.current.play();
  };

  const generateSpeech = async () => {
    if (!transcript.trim()) {
      toast.error("Add a transcript before generating speech.");
      return;
    }
    await speakWithBrowser(transcript.trim(), true, originalBlob);
    toast.success("Speaking now");
  };

  const play = () => {
    if (!transcript.trim()) {
      toast.error("Record or type text first.");
      return;
    }
    void speakWithBrowser(transcript.trim(), false);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    setStatus("Ready");
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setStatus("Ready");
  };

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(transcript);
    toast.success("Transcript copied");
  };

  const downloadTranscript = () => {
    downloadBlob(new Blob([transcript], { type: "text/plain;charset=utf-8" }), "voice-clone-transcript.txt");
  };

  const downloadAudio = () => {
    if (!originalBlob) {
      toast.error("Record audio first.");
      return;
    }
    downloadBlob(originalBlob, "voice-clone-recording.webm");
  };

  const shareAudio = async () => {
    if (!originalBlob) {
      toast.error("Record audio first.");
      return;
    }

    const file = new File([originalBlob], "voice-clone-recording.webm", { type: originalBlob.type || "audio/webm" });
    const canShareFile = "canShare" in navigator && navigator.canShare?.({ files: [file] });

    if ("share" in navigator && canShareFile) {
      await navigator.share({
        title: "Voice Clone Assistant recording",
        text: transcript || "Recorded audio",
        files: [file]
      });
      toast.success("Audio shared");
      return;
    }

    downloadBlob(originalBlob, "voice-clone-recording.webm");
    toast("Sharing is not available in this browser, so I downloaded the recording.");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if (event.code === "Space") {
        event.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          void startRecording();
        }
      }
      if (event.key.toLowerCase() === "s") void generateSpeech();
      if (event.key.toLowerCase() === "p") play();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 lg:px-8 lg:py-7">
      <Toaster position="top-right" toastOptions={{ className: "dark:bg-slate-900 dark:text-white" }} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-24 sm:gap-5 lg:pb-0">
        <header className="glass rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300 sm:text-sm">Instant voice workspace</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-5xl">Voice Clone Assistant</h1>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:items-center lg:justify-end">
              <StatusPill label={status} className={statusTone} />
              <StatusPill label={formatTime(seconds)} className="bg-slate-950/10 font-mono text-slate-900 dark:bg-white/10 dark:text-white" />
              <StatusPill label={`${Math.round(micLevel * 100)}% mic`} className="bg-teal-500/15 text-teal-800 dark:text-teal-200" />
              <button
                type="button"
                onClick={() => setDarkMode((value) => !value)}
                className="glass-strong inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-2xl text-slate-800 transition hover:scale-[1.03] dark:text-white"
                aria-label="Toggle dark mode"
                title="Toggle dark mode"
              >
                {darkMode ? <MdLightMode /> : <MdDarkMode />}
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[0.88fr_1.34fr_0.88fr]">
          <motion.aside initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[28px] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Status" value={status} />
              <Metric label="Timer" value={formatTime(seconds)} />
            </div>

            <div className="my-6 flex justify-center sm:my-8">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative flex h-32 w-32 items-center justify-center rounded-full text-6xl text-white shadow-2xl transition focus:outline-none focus:ring-4 focus:ring-teal-300 sm:h-40 sm:w-40 ${
                  isRecording ? "bg-rose-500 animate-soft-pulse" : "bg-teal-600 hover:scale-[1.03]"
                }`}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? <span className="absolute inset-0 rounded-full border-8 border-white/20" /> : null}
                <MdMic />
              </button>
            </div>

            <div className="glass-strong rounded-3xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <MdGraphicEq className="text-2xl text-teal-600 dark:text-teal-300" />
                Mic input
                <span className="ml-auto font-mono text-xs">{Math.round(micLevel * 100)}%</span>
              </div>
              <div className="flex h-24 items-center justify-center gap-1 overflow-hidden rounded-2xl bg-slate-950/5 px-3 dark:bg-white/5 sm:h-28">
                {Array.from({ length: 34 }).map((_, index) => (
                  <motion.span
                    key={index}
                    animate={{ height: isRecording ? 10 + micLevel * (22 + ((index * 9) % 58)) : 10 }}
                    transition={{ duration: 0.12 }}
                    className="w-1.5 rounded-full bg-gradient-to-t from-teal-500 to-rose-400"
                  />
                ))}
              </div>
            </div>

            {recognitionNotice ? (
              <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-200/18 p-3 text-sm font-semibold text-amber-900 dark:border-amber-200/20 dark:bg-amber-300/10 dark:text-amber-100">
                {recognitionNotice}
              </div>
            ) : null}

            {originalAudioUrl ? (
              <audio className="mt-3 w-full rounded-2xl" controls src={originalAudioUrl} />
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <IconButton icon={<MdPlayArrow />} label="Start" onClick={startRecording} disabled={isRecording} />
              <IconButton icon={<MdStop />} label="Stop" onClick={stopRecording} disabled={!isRecording} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <IconButton icon={<MdPlayArrow />} label="Play Recording" onClick={playRecording} disabled={!hasRecording} />
              <IconButton icon={<MdDownload />} label="Save Recording" onClick={downloadAudio} disabled={!hasRecording} />
              <IconButton icon={<MdShare />} label="Share Recording" onClick={() => void shareAudio()} disabled={!hasRecording} />
            </div>

            <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white/38 p-3 text-sm font-semibold dark:bg-white/5">
              Silence stop
              <input className="h-5 w-5 accent-teal-700" type="checkbox" checked={silenceStop} onChange={(event) => setSilenceStop(event.target.checked)} />
            </label>
            <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white/38 p-3 text-sm font-semibold dark:bg-white/5">
              Auto playback
              <input className="h-5 w-5 accent-teal-700" type="checkbox" checked={autoPlayback} onChange={(event) => setAutoPlayback(event.target.checked)} />
            </label>
          </motion.aside>

          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="glass rounded-[28px] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Transcript</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Record, edit, then press Speak.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <IconButton icon={<MdContentCopy />} label="Copy" onClick={copyTranscript} disabled={!transcript} />
                <IconButton icon={<MdDownload />} label="TXT" onClick={downloadTranscript} disabled={!transcript} />
              </div>
            </div>

            <textarea
              value={`${transcript}${interimTranscript ? ` ${interimTranscript}` : ""}`}
              onChange={(event) => {
                setTranscript(event.target.value);
                setInterimTranscript("");
              }}
              className="min-h-[280px] w-full resize-none rounded-3xl border border-white/50 bg-white/62 p-4 text-base leading-relaxed outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-300/35 dark:border-white/10 dark:bg-slate-950/35 sm:min-h-[390px] sm:p-5 sm:text-lg"
              placeholder="Your live transcript appears here. Edit it before generating speech."
              aria-label="Editable transcript"
            />

            <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:grid-cols-4">
              <Metric label="Characters" value={characters.toString()} />
              <Metric label="Words" value={words.toString()} />
              <Metric label="Speaking time" value={formatTime(estimatedSpeakingSeconds)} />
              <Metric label="Confidence" value={confidence == null ? "N/A" : `${Math.round(confidence * 100)}%`} />
            </div>

            <button
              type="button"
              onClick={generateSpeech}
              disabled={!hasTranscript}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-base font-black text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              <MdSave className="text-2xl" />
              Speak
            </button>
          </motion.section>

          <motion.aside initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="glass rounded-[28px] p-4 sm:p-5">
            <h2 className="mb-4 text-2xl font-black">Voice Settings</h2>
            <div className="space-y-4">
              <Select label="Voice" value={voice.value} onChange={(value) => setVoice(voices.find((item) => item.value === value) ?? voices[0])} options={voices.map((item) => ({ label: `${item.label} - ${item.category}`, value: item.value }))} />
              <Select label="Language" value={language} onChange={setLanguage} options={languages} />
              <Select label="Accent" value={accent} onChange={setAccent} options={accents.map((item) => ({ label: item, value: item }))} />
              <Slider label="Playback speed" value={speed} min={0.25} max={4} step={0.05} onChange={setSpeed} suffix="x" />
              <Slider label="Pitch" value={pitch} min={-12} max={12} step={1} onChange={setPitch} />
              <Slider label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} suffix="%" display={(value) => Math.round(value * 100)} />
            </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <IconButton icon={<MdPlayArrow />} label="Speak" onClick={play} />
              <IconButton icon={<MdPause />} label="Pause" onClick={pause} />
              <IconButton icon={<MdStop />} label="Stop" onClick={stop} />
              <IconButton icon={<MdReplay />} label="Replay" onClick={() => { stop(); play(); }} />
              <IconButton icon={<MdRefresh />} label="Resume" onClick={() => window.speechSynthesis.resume()} />
              <IconButton icon={<MdPlayArrow />} label="Play Rec" onClick={playRecording} disabled={!hasRecording} />
              <IconButton icon={<MdDownload />} label="Recording" onClick={downloadAudio} disabled={!hasRecording} />
              <IconButton icon={<MdShare />} label="Share Rec" onClick={() => void shareAudio()} disabled={!hasRecording} />
            </div>
          </motion.aside>
        </section>

        <section className="glass rounded-[28px] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black">History</h2>
            <button
              type="button"
              onClick={() => persistHistory([])}
              className="inline-flex items-center gap-2 rounded-full bg-white/45 px-3 py-2 text-sm font-bold dark:bg-white/10"
            >
              <MdDelete /> Clear
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {history.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Completed recordings will appear here with transcript, original audio, and selected voice.</p>
              ) : (
                history.map((item) => (
                  <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key={item.id} className="glass-strong rounded-3xl p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-black">{new Date(item.date).toLocaleString()}</p>
                      <span className="rounded-full bg-teal-500/15 px-2 py-1 text-xs font-bold text-teal-800 dark:text-teal-200">{item.selectedVoice}</span>
                    </div>
                    <p className="line-clamp-3 text-sm text-slate-700 dark:text-slate-200">{item.transcript}</p>
                    <div className="mt-3 space-y-2">
                      {item.originalAudio ? <audio className="w-full" controls src={item.originalAudio} /> : null}
                      {item.generatedAudio ? <audio className="w-full" controls src={item.generatedAudio} /> : null}
                    </div>
                  </motion.article>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-3 gap-2 rounded-3xl border border-white/30 bg-white/75 p-2 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/75 lg:hidden">
        <IconButton icon={isRecording ? <MdStop /> : <MdMic />} label={isRecording ? "Stop" : "Record"} onClick={isRecording ? stopRecording : startRecording} />
        <IconButton icon={<MdPlayArrow />} label={hasTranscript ? "Speak" : "Play Rec"} onClick={hasTranscript ? play : playRecording} disabled={!hasTranscript && !hasRecording} />
        <IconButton icon={<MdShare />} label="Share" onClick={() => void shareAudio()} disabled={!hasRecording} />
      </div>
    </main>
  );
}

function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-black ${className}`}>
      <MdRadioButtonChecked className="text-lg" />
      {label}
    </span>
  );
}

function IconButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl bg-white/50 px-2.5 py-2 text-center text-xs font-black leading-tight text-slate-800 transition hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 sm:gap-2 sm:px-3 sm:text-sm"
    >
      <span className="shrink-0 text-xl">{icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/42 p-3 dark:bg-white/5">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { label: string; value: string }[] }) {
  return (
    <label className="block text-sm font-bold">
      <span className="mb-2 block text-slate-700 dark:text-slate-200">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/50 bg-white/60 px-4 py-3 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/35">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  display,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  display?: (value: number) => number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-bold">
      <span className="mb-2 flex justify-between text-slate-700 dark:text-slate-200">
        {label}
        <span>{display ? display(value) : value}{suffix}</span>
      </span>
      <input className="range w-full" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
