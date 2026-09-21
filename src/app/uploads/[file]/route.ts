import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";

/**
 * Serve arquivos de /app/public/uploads por URL.
 *
 * O `next start` do Next 16 NÃO serve arquivos de public/ criados em
 * runtime (só os que existiam no build) — por isso /uploads/*.mp4 dava 404.
 * Esta rota lê do disco com suporte a Range (essencial para players de
 * vídeo poderem buscar/avançar).
 */
const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  // Só nome de arquivo seguro (sem path traversal)
  const safe = path.basename(file);
  if (!/^[a-zA-Z0-9._-]+$/.test(safe) || safe === "." || safe === "..") {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", safe);
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const ext = path.extname(safe).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    // Nomes de upload são UUIDs — conteúdo imutável
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  let start = 0;
  let end = info.size - 1;
  let status = 200;

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = Math.min(parseInt(m[2], 10), info.size - 1);
      if (Number.isNaN(start) || start > end || start >= info.size) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
  }

  headers["Content-Length"] = String(end - start + 1);

  const stream = createReadStream(filePath, { start, end });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status,
    headers,
  });
}
