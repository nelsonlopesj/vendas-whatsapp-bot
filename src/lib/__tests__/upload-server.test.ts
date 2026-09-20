import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { parseAndSaveUpload } from "../upload-server";

const BOUNDARY = "----ezflowtestboundary";

function multipartBody(originalName: string, content: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${originalName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8");
  return Buffer.concat([head, content, tail]);
}

function toWebStream(buffer: Buffer): ReadableStream<Uint8Array> {
  const res = new Response(new Uint8Array(buffer));
  return res.body as ReadableStream<Uint8Array>;
}

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "ezflow-upload-test-"));
  tmpDirs.push(d);
  return d;
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("parseAndSaveUpload (busboy)", () => {
  it("salva arquivo pequeno (pdf) com nome único e conteúdo idêntico", async () => {
    const dir = makeTmpDir();
    const content = Buffer.from("%PDF-1.4 conteudo de teste", "utf8");
    const body = multipartBody("guia.pdf", content);

    const saved = await parseAndSaveUpload(
      toWebStream(body),
      `multipart/form-data; boundary=${BOUNDARY}`,
      dir
    );

    expect(saved.originalName).toBe("guia.pdf");
    expect(saved.url).toMatch(/^\/uploads\/[0-9a-f-]+\.pdf$/);
    expect(saved.size).toBe(content.length);
    const onDisk = readFileSync(path.join(dir, saved.filename));
    expect(onDisk.equals(content)).toBe(true);
  });

  it("salva arquivo grande de 30MB (caso do vídeo que quebrava o formData do Next)", async () => {
    const dir = makeTmpDir();
    const content = Buffer.alloc(30 * 1024 * 1024, 0xab); // 30MB
    const body = multipartBody("apresentacao.mp4", content);

    const saved = await parseAndSaveUpload(
      toWebStream(body),
      `multipart/form-data; boundary=${BOUNDARY}`,
      dir
    );

    expect(saved.originalName).toBe("apresentacao.mp4");
    expect(saved.size).toBe(content.length);
    expect(existsSync(path.join(dir, saved.filename))).toBe(true);
  });

  it("rejeita extensão fora da whitelist (svg)", async () => {
    const dir = makeTmpDir();
    const body = multipartBody("malicioso.svg", Buffer.from("<svg/>"));

    await expect(
      parseAndSaveUpload(toWebStream(body), `multipart/form-data; boundary=${BOUNDARY}`, dir)
    ).rejects.toThrow(/não permitido/);
  });

  it("rejeita corpo vazio", async () => {
    const dir = makeTmpDir();
    await expect(parseAndSaveUpload(null, "", dir)).rejects.toThrow(/vazio/);
  });
});
