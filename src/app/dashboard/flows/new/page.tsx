import { FlowEditor } from "@/components/flows/flow-editor";

export default function NewFlowPage() {
  return (
    <div className="space-y-6 h-full">
      <div>
        <h1 className="text-2xl font-bold">Criar Fluxo</h1>
        <p className="text-sm text-muted-foreground">
          Monte sua automação de venda conectando caixinhas
        </p>
      </div>
      <FlowEditor />
    </div>
  );
}
