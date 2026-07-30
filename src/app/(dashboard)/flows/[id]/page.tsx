import { FlowEditor } from "@/components/flows/flow-editor";

export default async function EditFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6 h-full">
      <div>
        <h1 className="text-2xl font-bold">Editar Fluxo</h1>
        <p className="text-sm text-muted-foreground">
          Modifique os passos da sua automação
        </p>
      </div>
      <FlowEditor flowId={id} />
    </div>
  );
}
