import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { TutorialVideosManager } from "@/components/admin/tutorial-videos-manager";

export default async function TutorialVideosPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "owner") redirect("/dashboard");

  const videos = await prisma.tutorialVideo.findMany({
    orderBy: { order: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vídeos do Tutorial</h1>
        <p className="text-sm text-muted-foreground">
          Aparecem na seção 🎬 Vídeos passo a passo do guia do cliente:{" "}
          <span className="font-medium">ezflow.com.br/tutorial.html</span>
        </p>
      </div>
      <TutorialVideosManager initial={JSON.parse(JSON.stringify(videos))} />
    </div>
  );
}
