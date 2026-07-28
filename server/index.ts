import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { z } from "zod";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 26 * 1024 * 1024 }
});

const port = Number(process.env.API_PORT ?? 4000);

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio file is required." });
    }

    const client = getOpenAIClient();
    const language = typeof req.body.language === "string" ? req.body.language : undefined;
    const file = await toFile(req.file.buffer, req.file.originalname || "recording.webm", {
      type: req.file.mimetype || "audio/webm"
    });

    const transcription = await client.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: language || undefined,
      response_format: "json"
    });

    res.json({
      text: transcription.text,
      confidence: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    res.status(500).json({ error: message });
  }
});

const speechSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  voice: z.string().trim().min(1).default("alloy"),
  speed: z.number().min(0.25).max(4).default(1),
  pitch: z.number().min(-12).max(12).default(0),
  volume: z.number().min(0).max(1).default(1),
  accent: z.string().trim().max(80).default("Neutral"),
  language: z.string().trim().max(32).default("en"),
  format: z.enum(["mp3", "wav"]).default("mp3"),
  style: z.string().trim().max(120).default("Friendly assistant")
});

app.post("/api/tts", async (req, res) => {
  try {
    const body = speechSchema.parse(req.body);
    const client = getOpenAIClient();
    const instructions = [
      `Speak in a ${body.style.toLowerCase()} style.`,
      `Use a ${body.accent.toLowerCase()} accent.`,
      `Language hint: ${body.language}.`,
      body.pitch === 0 ? "Use a natural pitch." : `Adjust perceived pitch by ${body.pitch} semitones.`
    ].join(" ");

    const audio = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: body.voice,
      input: body.text,
      instructions,
      response_format: body.format,
      speed: body.speed
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    res.setHeader("Content-Type", body.format === "wav" ? "audio/wav" : "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename="voice-clone.${body.format}"`);
    res.setHeader("X-Playback-Volume", String(body.volume));
    res.send(buffer);
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Speech generation failed.";
    res.status(status).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Voice Clone Assistant API listening on http://localhost:${port}`);
});
