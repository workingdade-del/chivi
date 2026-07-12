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
    // -application voip + -map 0:a:0 : réglages standards des notes vocales
    // WhatsApp — sans "voip", libopus encode par défaut en mode générique
    // ("audio"), qu'un décodage réel a rejeté avec l'erreur Meta 131053
    // ("processed as application/octet-stream") sur un vrai enregistrement
    // navigateur alors qu'un fichier de test synthétique passait. -map
    // force à ne prendre que la première piste audio (le conteneur mp4 de
    // Safari peut embarquer d'autres pistes). -map_metadata -1 supprime les
    // tags du conteneur source (handler_name, vendor_id, major_brand…) que
    // ffmpeg recopie sinon tels quels dans les commentaires Ogg/Opus —
    // observé sur le fichier réel rejeté par Meta, absent du test
    // synthétique qui lui est passé.
    const { stdout, stderr } = await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-map", "0:a:0",
      "-map_metadata", "-1",
      "-map_metadata:s:a:0", "-1",
      "-c:a", "libopus",
      "-application", "voip",
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "24k",
      outputPath,
    ]);
    const output = await readFile(outputPath);
    console.log("[audio-convert] conversion réussie", {
      inputBytes: input.length,
      outputBytes: output.length,
      sourceExt,
      ffmpegStdout: stdout,
      ffmpegStderr: stderr,
    });
    return output;
  } catch (err) {
    console.error("[audio-convert] échec conversion ffmpeg", {
      inputBytes: input.length,
      sourceExt,
      error: err,
    });
    throw err;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
