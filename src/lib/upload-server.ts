/**
 * Upload de arquivo em produção: parser multipart com busboy (streaming).
 *
 * O `request.formData()` do Next quebra com arquivos grandes
 * ("TypeError: Failed to parse body as FormData.") — o parser compilado do
 * edge-runtime não aguenta corpos multipart maiores. O busboy faz streaming
 * direto para o disco, sem buffer em memória, e é o padrão de produção.
 */
import busboy from "busboy";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Whitelist de extensão: produtos digitais seguros (PDF, áudio, vídeo,
// imagem). Bloqueia svg/html/js (XSS armazenado no mesmo domínio)
export const ALLOWED_EXT = new Set([
  ".pdf", ".mp3", ".m4a", ".ogg", ".wav",
  ".mp4", ".mov", ".avi", ".m4v", ".mkv", ".webm", ".3gp",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
]);

export interface SavedUpload {
  url: string;
  filename: string;
  originalName: string;
  size: number;
}

/**
 * Lê o corpo multipart da requisição, valida e grava o arquivo em disco.
 * Lança Error com mensagem amigável (HTTP 400) ou técnica (HTTP 500).
 */
export async function parseAndSaveUpload(
  body: ReadableStream<Uint8Array> | null,
  contentType: string,
  uploadDir: string = path.join(process.cwd(), "public", "uploads")
): Promise<SavedUpload> {
  if (!body) {
    throw new Error("Corpo da requisição vazio");
  }
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Envie o arquivo como multipart/form-data");
  }

  // Captura o primeiro arquivo do multipart (limite: 1 arquivo, 100MB)
  const file = await new Promise<{ stream: NodeJS.ReadableStream; originalName: string }>(
    (resolve, reject) => {
      const bb = busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      });
      bb.once("file", (_fieldname: string, stream: NodeJS.ReadableStream, info: busboy.FileInfo) => {
        resolve({ stream, originalName: info.filename || "arquivo" });
      });
      bb.once("error", reject);
      Readable.fromWeb(body as any).pipe(bb);
    }
  );

  const ext = path.extname(file.originalName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(
      `Tipo de arquivo não permitido (${ext || "sem extensão"}). Use PDF, áudio, vídeo ou imagem.`
    );
  }

  const filename = `${crypto.randomUUID()}${ext}`;
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);

  const out = createWriteStream(filePath);
  let sizeExceeded = false;
  file.stream.once("limit", () => {
    sizeExceeded = true;
  });
  file.stream.pipe(out);

  try {
    await new Promise<void>((resolve, reject) => {
      out.once("finish", resolve);
      out.once("error", reject);
      (file.stream as any).once("error", reject);
    });
  } catch (err) {
    await unlink(filePath).catch(() => {});
    throw err;
  }

  if (sizeExceeded) {
    await unlink(filePath).catch(() => {});
    throw new Error("Arquivo muito grande (máx 100MB)");
  }

  return {
    url: `/uploads/${filename}`,
    filename,
    originalName: file.originalName,
    size: out.bytesWritten,
  };
}
