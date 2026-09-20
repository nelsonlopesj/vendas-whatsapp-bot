import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseAndSaveUpload } from "@/lib/upload-server";

export const maxDuration = 300; // uploads grandes podem demorar

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await parseAndSaveUpload(
      req.body,
      req.headers.get("content-type") || ""
    );

    return NextResponse.json(
      {
        url: result.url,
        filename: result.filename,
        originalName: result.originalName,
        size: result.size,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    const detail = String(error?.message || error);
    // Erros de validação do cliente = 400; o resto = 500
    const isClientError =
      detail.includes("não permitido") ||
      detail.includes("muito grande") ||
      detail.includes("multipart") ||
      detail.includes("Corpo da requisição");
    return NextResponse.json(
      { error: "Erro ao processar upload", detail },
      { status: isClientError ? 400 : 500 }
    );
  }
}
