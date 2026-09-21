import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { TutorialVideosManager } from "@/components/admin/tutorial-videos-manager";

export default async function TutorialVideosPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") redirect("/dashboard");

  let videos: any[] = [];
  let loadError: string | null = null;
  try {
    videos = await prisma.tutorialVideo.findMany({
      orderBy: { order: "asc" },
    });
  } catch (err: any) {
    console.error("TutorialVideo findMany error:", err);
    loadError = String(err?.message || err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vídeos do Tutorial</h1>
        <p className="text-sm text-muted-foreground">
          Aparecem na seção 🎬 Vídeos passo a passo do guia do cliente:{" "}
          <span className="font-medium">ezflow.com.br/tutorial.html</span>
        </p>
      </div>
      {loadError ? (
        <div className="p-4 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
          ⚠️ <b>Não foi possível carregar os vídeos — nada foi perdido.</b>
          <br />
          Isso normalmente indica que a tabela nova ainda não existe no banco.
          No servidor, rode:
          <br />
          <code className="block mt-2 p-2 rounded bg-black/5 text-xs break-all">
            docker exec $(docker ps -q --filter "name=portal") npx prisma db push --accept-data-loss
          </code>
          Motivo técnico: {loadError}
        </div>
      ) : (
        <TutorialVideosManager initial={JSON.parse(JSON.stringify(videos))} />
      )}
    </div>
  );
}
