"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  MdContentCopy,
  MdDelete,
  MdDownload,
  MdGraphicEq,
  MdMic,
  MdPause,
  MdPlayArrow,
  MdRadioButtonChecked,
  MdRefresh,
  MdReplay,
  MdSave,
  MdShare,
  MdStop,
  MdExpandMore
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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [silenceStop, setSilenceStop] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      stopAudioMeter();
    };
  }, [stopAudioMeter]);

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
      toast.error("Speech detection needs Chrome or Edge for instant browser mode.");
      return false;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.onstart = () => setStatus("Listening...");
    recognition.onaudiostart = () => setStatus("Listening...");
    recognition.onspeechstart = () => setStatus("Listening...");
    recognition.onnomatch = () => toast("Audio was heard, but words were unclear. Try the closest language option.");
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
        toast("No speech detected yet. Keep the tab active and speak clearly.");
        return;
      }
      toast.error(`Speech recognition: ${event.error}`);
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
      toast.error("Speech recognition could not start. Try refreshing the page.");
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
          setTranscript(instantTranscript);
          setInterimTranscript("");
          toast.success("Instant transcript ready");
          if (autoPlayback) void speakWithBrowser(instantTranscript, true, blob);
          return;
        }

        toast.error("No speech was detected. Use Chrome or Edge, allow microphone access, and keep this tab active while speaking.");
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
        if (instantUnavailableRef.current) {
          setStatus("Idle");
          return;
        }
        finishInstantRecording(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      if (!startBrowserRecognition()) {
        instantUnavailableRef.current = true;
        stream.getTracks().forEach((track) => track.stop());
        stopAudioMeter();
        if (recorder.state === "recording") recorder.stop();
        setIsRecording(false);
        setStatus("Idle");
        return;
      }
      setIsRecording(true);
      toast.success("Recording started");
    } catch (error) {
      setStatus("Idle");
      toast.error(error instanceof Error ? error.message : "Microphone permission was denied.");
    }
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-24 sm:gap-7 lg:pb-0">
        <header className="sticky top-4 z-30 glass rounded-[28px] border-white/10 bg-slate-950/85 p-4 shadow-glass backdrop-blur-xl dark:border-white/10 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-3xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/20">
                <MdMic className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/80">Voice AI Studio</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Voice Clone Assistant</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 self-start sm:self-auto">
              <div className="rounded-3xl bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-300">
                Premium mode
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr_0.9fr]">
          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[36px] border-white/10 p-5 shadow-glass dark:border-white/10 sm:p-6"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/80">Recording Status</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{status}</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
                  <MdRadioButtonChecked className="h-4 w-4 text-cyan-300" />
                  {formatTime(seconds)}
                </div>
              </div>

              <div className="rounded-[28px] bg-slate-950/80 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                  <span>Mic level</span>
                  <span>{Math.round(micLevel * 100)}%</span>
                </div>
                <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    animate={{ width: `${Math.max(10, Math.min(100, Math.round(micLevel * 100)))}%` }}
                    transition={{ duration: 0.15 }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400"
                  />
                </div>
              </div>

              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-cyan-500 text-white shadow-[0_35px_90px_rgba(34,211,238,0.22)] transition-all duration-300 ease-out sm:h-28 sm:w-28">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`relative flex h-20 w-20 items-center justify-center rounded-full text-4xl transition focus:outline-none focus:ring-4 focus:ring-cyan-300 sm:h-24 sm:w-24 ${
                    isRecording ? "animate-pulse-fast bg-rose-500" : "bg-cyan-500 hover:bg-cyan-400"
                  }`}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                >
                  {isRecording ? <MdStop className="h-8 w-8" /> : <MdMic className="h-8 w-8" />}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={play}
                  disabled={!hasTranscript}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MdPlayArrow className="h-5 w-5" />
                  Play
                </button>
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <MdStop className="h-5 w-5" />
                  Stop
                </button>
                <button
                  type="button"
                  onClick={pause}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <MdPause className="h-5 w-5" />
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => { stop(); play(); }}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <MdReplay className="h-5 w-5" />
                  Replay
                </button>
                <button
                  type="button"
                  onClick={downloadAudio}
                  disabled={!originalBlob}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MdDownload className="h-5 w-5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => void shareAudio()}
                  disabled={!originalBlob}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MdShare className="h-5 w-5" />
                  Share
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-3xl bg-white/5 p-4 text-sm text-slate-300">
                  <span>Silence stop</span>
                  <input className="h-5 w-5 accent-cyan-400" type="checkbox" checked={silenceStop} onChange={(event) => setSilenceStop(event.target.checked)} />
                </div>
                <div className="flex items-center justify-between rounded-3xl bg-white/5 p-4 text-sm text-slate-300">
                  <span>Auto playback</span>
                  <input className="h-5 w-5 accent-cyan-400" type="checkbox" checked={autoPlayback} onChange={(event) => setAutoPlayback(event.target.checked)} />
                </div>
              </div>
            </div>
          </motion.aside>

          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="glass rounded-[28px] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">Transcript</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                  Speak into your mic, adjust the transcript, and use browser speech for instant playback.
                </p>
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
              className="min-h-[300px] w-full resize-none rounded-[32px] border border-slate-200 bg-white/85 p-5 text-base leading-relaxed outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-200/60 dark:border-white/10 dark:bg-slate-950/80 dark:text-white sm:min-h-[420px] sm:text-lg"
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
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[28px] bg-cyan-600 px-6 py-4 text-base font-black text-white transition hover:-translate-y-0.5 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950"
            >
              <MdSave className="text-2xl" />
              Speak
            </button>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="glass rounded-[36px] border-white/10 p-5 shadow-glass dark:border-white/10 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">Voice Settings</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Core controls plus hidden advanced tuning.</p>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <span>{advancedOpen ? "Hide advanced" : "Show advanced"}</span>
                <MdExpandMore className={`h-5 w-5 transition ${advancedOpen ? "rotate-180" : "rotate-0"}`} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Select label="Voice" value={voice.value} onChange={(value) => setVoice(voices.find((item) => item.value === value) ?? voices[0])} options={voices.map((item) => ({ label: `${item.label} - ${item.category}`, value: item.value }))} />
              <Select label="Language" value={language} onChange={setLanguage} options={languages} />
              <Select label="Accent" value={accent} onChange={setAccent} options={accents.map((item) => ({ label: item, value: item }))} />
            </div>

            <AnimatePresence initial={false}>
              {advancedOpen ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-5 space-y-4">
                    <Slider label="Playback speed" value={speed} min={0.25} max={4} step={0.05} onChange={setSpeed} suffix="x" />
                    <Slider label="Pitch" value={pitch} min={-12} max={12} step={1} onChange={setPitch} />
                    <Slider label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} suffix="%" display={(value) => Math.round(value * 100)} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.aside>
        </section>

        <section className="glass rounded-[28px] p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Recording History</h2>
              <p className="mt-1 text-sm text-slate-400">Recent transcripts and recordings for quick access.</p>
            </div>
            <button
              type="button"
              onClick={() => persistHistory([])}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <MdDelete /> Clear all
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {history.length === 0 ? (
                <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">
                  Completed recordings will appear here with transcript, audio, and voice metadata.
                </div>
              ) : (
                history.map((item) => (
                  <motion.article
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    key={item.id}
                    className="glass-strong rounded-[28px] border border-white/10 p-5"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-300">Recording</p>
                        <p className="mt-1 text-sm text-slate-400">{new Date(item.date).toLocaleDateString()}</p>
                      </div>
                      <span className="rounded-2xl bg-cyan-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                        {item.selectedVoice}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-slate-300">{item.transcript}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                        <MdPlayArrow className="h-4 w-4" /> Play
                      </button>
                      <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                        <MdDownload className="h-4 w-4" /> Download
                      </button>
                      <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                        <MdShare className="h-4 w-4" /> Share
                      </button>
                      <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                        <MdDelete className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </motion.article>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-3 gap-3 rounded-full border border-white/10 bg-slate-950/95 p-3 shadow-glass backdrop-blur-2xl lg:hidden">
        <IconButton icon={isRecording ? <MdStop /> : <MdMic />} label={isRecording ? "Stop" : "Record"} onClick={isRecording ? stopRecording : startRecording} />
        <IconButton icon={<MdPlayArrow />} label="Speak" onClick={play} disabled={!hasTranscript} />
        <IconButton icon={<MdShare />} label="Share" onClick={() => void shareAudio()} disabled={!originalBlob} />
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
