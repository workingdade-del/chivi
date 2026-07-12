import ffmpegPath from "ffmpeg-static";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

export const OGG_OPUS_MIME_TYPE = "audio/ogg; codecs=opus";

/**
 * WhatsApp n'accepte les messages de type "note vocale" qu'au format
 * OGG/Opus — le navigateur enregistre en webm/opus (Chrome/Firefox) ou
 * mp4/aac (Safari), qui sont acceptés par l'API d'envoi (200 OK) mais ne se
 * lisent pas forcément chez le destinataire. On reconvertit donc toujours
 * côté serveur avant l'envoi, quel que soit le format d'origine.
 */
export async function convertToOggOpus(input: Buffer, sourceExt: string): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("Binaire ffmpeg introuvable (ffmpeg-static) — impossible de convertir l'audio");
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpdir(), `${id}-in.${sourceExt}`);
  const outputPath = path.join(tmpdir(), `${id}-out.ogg`);

  await writeFile(inputPath, input);
  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-c:a", "libopus",
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "32k",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
