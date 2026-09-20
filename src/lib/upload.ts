/**
 * Upload de arquivo para /api/upload com progresso real (XHR).
 * fetch() não expõe progresso de upload — por isso usamos XMLHttpRequest.
 */
export function uploadFileWithProgress(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; originalName?: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Resposta inválida do servidor"));
        }
      } else {
        reject(new Error(`Upload falhou (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Erro de rede durante o upload"));
    xhr.send(form);
  });
}
