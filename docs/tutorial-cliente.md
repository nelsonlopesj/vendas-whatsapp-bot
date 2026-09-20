# EZFlow — Guia de Primeiros Passos

> Do zero ao seu robô de atendimento e vendas no WhatsApp em aproximadamente 20 minutos.
> Sem programação. Sem complicação. Este guia foi escrito para quem nunca mexeu com automação.

---

## O que é a EZFlow?

A **EZFlow** é uma plataforma onde você cria um **robô** que atende e vende no seu WhatsApp automaticamente, 24 horas por dia.

Na prática, funciona assim:

1. Você conecta seu WhatsApp na plataforma (uma vez só, escaneando um QR Code).
2. Você monta (ou importa) um **fluxo**: a sequência de mensagens que o robô vai enviar. Exemplo: *cliente manda "colorir" → robô apresenta o produto → cliente digita "sim" → robô envia o código PIX → cliente paga → robô entrega o arquivo sozinho*.
3. Seu cliente conversa com o robô como se estivesse conversando com você.
4. O pagamento cai na sua conta automaticamente.

**O que você vai precisar:**

| Item | Onde conseguir |
|------|----------------|
| Celular com WhatsApp | O número que você quer que o robô use |
| Um e-mail | Para criar sua conta |
| Conta no Mercado Pago | Gratuita — para receber os pagamentos via PIX |
| Seu produto digital (PDF, áudio, vídeo...) | O que você vai vender |

**Resumo das etapas:**

1. Criar sua conta (grátis por 7 dias)
2. Conectar seu WhatsApp
3. Configurar o PIX (Mercado Pago)
4. Importar um fluxo pronto
5. Cadastrar seu produto
6. Ativar e testar

---

## Etapa 1 — Criar sua conta (7 dias grátis)

1. Acesse **https://ezflow.com.br** pelo computador ou celular.
2. Clique no botão **"Testar 7 dias"** (ou "Começar grátis"). *Não pede cartão de crédito.*
3. Preencha o cadastro:
   - **Seu nome** — ex: *Maria Silva*
   - **E-mail** — um e-mail que você use com frequência
   - **Senha** — mínimo 8 caracteres (anote em um lugar seguro!)
   - **Nome do seu negócio** — ex: *Desenhos da Maria*
   - **Número do WhatsApp** — o número onde você quer que o robô trabalhe, com DDI e DDD, sem espaços. Ex: `5531999999999`
   - Você também pode entrar com o botão **"Cadastrar com Google"**.
4. Pronto! Você caiu no painel da EZFlow. A partir de agora, é só acessar **ezflow.com.br** e fazer login.

> 💡 **Os 7 dias grátis** começam a contar no cadastro e dão acesso a tudo: fluxos, PIX, templates. Sem cartão de crédito.

---

## Etapa 2 — Conectar seu WhatsApp

Este passo faz o robô "morar" dentro do seu WhatsApp. Leva 30 segundos.

1. No menu lateral da EZFlow, clique em **"WhatsApp & PIX"**.
2. Na seção **"Conectar WhatsApp"**, aparece um **QR Code** na tela.
3. Pegue o celular do número que você cadastrou e abra o WhatsApp:
   - Android: toque nos **3 pontinhos** (⋮) → **Aparelhos conectados** → **Conectar um aparelho**
   - iPhone: **Ajustes** → **Aparelhos conectados** → **Conectar um aparelho**
4. Aponte a câmera do celular para o QR Code que está na tela do computador.
5. Quando aparecer **"WhatsApp Conectado!"** em verde, está pronto. 🎉

> ⚠️ **Atenção importante:**
> - O número que você conectar **será atendido pelo robô**. Se você conectar o seu WhatsApp pessoal, o robô responderá as suas conversas pessoais. O ideal é usar um **número comercial** (pode ser o número do seu WhatsApp Business).
> - Se o QR Code expirar (demora alguns minutos), clique em **"Atualizar QR Code (gera novo)"**.
> - Se a conexão cair um dia, é só repetir este processo — leva 30 segundos.

---

## Etapa 3 — Receber pagamentos com PIX (Mercado Pago)

O robô sabe conversar — mas quem **gera o código PIX** e **avisa quando o pagamento caiu** é o Mercado Pago. A EZFlow se conecta a ele por um "token" (uma chave de acesso). Você só precisa criar a conta uma vez e colar essa chave na plataforma.

> ✅ **Você só precisa de UMA coisa: o Access Token.**
> **Não** é preciso criar aplicação/integração no Mercado Pago, **nem** configurar webhook, **nem** copiar endereços de URL. A EZFlow confirma o pagamento sozinha: consulta o Mercado Pago automaticamente a cada 30 segundos até o PIX cair. O token faz todo o trabalho.

### 3.1 — Criar sua conta no Mercado Pago (grátis)

1. Baixe o aplicativo **Mercado Pago** no celular, ou acesse **https://mercadopago.com.br** no computador.
2. Clique em **"Criar conta"** e cadastre com seu **CPF ou CNPJ**.
3. Confirme sua identidade quando o aplicativo pedir (geralmente pedem uma **foto do seu documento** e uma **selfie**). Esse passo é obrigatório para **receber** pagamentos — sem ele, o PIX não funciona.
4. Se o Mercado Pago pedir para cadastrar uma **chave PIX**, cadastre (pode usar seu e-mail ou celular). Isso é o que permite os clientes pagarem você.

### 3.2 — Copiar o "Access Token" (a chave de acesso)

1. No computador, acesse **https://www.mercadopago.com.br/settings/account/credentials**
2. Selecione a aba **"Produção"** (não é "Teste").
3. Você verá um código chamado **Access Token** — ele começa com `APP_USR-...`.
4. Clique em **copiar** esse código inteiro.

> 🔐 **Esse código é secreto.** Ele é a chave da sua conta — não envie para ninguém, não poste em lugar nenhum. Só cole na EZFlow.

### 3.3 — Colar o token na EZFlow

1. Na EZFlow, menu **"WhatsApp & PIX"** → seção **"Configurar PIX"**.
2. Clique na aba **"Mercado Pago"**.
3. Cole o **Access Token** no campo correspondente.
4. Clique em **"Salvar"**.
5. Deve aparecer a mensagem: **"✅ Salvo! Gateway ativo: Mercado Pago"**.

### 3.4 — Como o dinheiro chega até você

- Quando o cliente paga, o dinheiro **cai na sua conta Mercado Pago** na hora.
- Do aplicativo do Mercado Pago, você **transfere para sua conta bancária** quando quiser (pode levar alguns dias úteis, dependendo do banco).
- O Mercado Pago cobra uma **pequena taxa por venda** (é o custo do serviço — consulte as taxas atuais no app).

> 💡 A EZFlow também aceita outros meios: **InfinitePay** e **PagBank**. Fica na mesma tela, em outras abas. Para começar, o Mercado Pago é o caminho mais simples.

---

## Etapa 4 — Importar um fluxo pronto (grátis)

Você não precisa montar seu primeiro fluxo do zero. A EZFlow tem **templates prontos** — e importá-los leva 1 clique.

1. No menu, clique em **"Fluxos"**.
2. Role até **"Templates Prontos"**.
3. Escolha o que combina com o seu produto:
   - **Guia da Noiva** — exemplo de venda de PDF para noivas
   - **Desenhos Bíblicos** — exemplo de venda de desenhos para colorir
   - **Audiobook Meditação** — exemplo de venda de áudio
4. Clique em **"Importar grátis →"**.
5. O fluxo aparece na sua lista de fluxos. 🎉

> 💡 Você também pode importar um **arquivo de fluxo** (`.ezflow.json`) que receber da nossa equipe: botão **"Importar"** no topo da página de Fluxos → escolha o arquivo no computador.

---

## Etapa 5 — Cadastrar seu produto digital

O produto é **o que o robô entrega** quando o cliente paga.

1. No menu, clique em **"Produtos"** → **"Novo Produto"**.
2. Preencha:
   - **Nome** — ex: *E-book 30 Desenhos Bíblicos para Colorir*
   - **Preço** — ex: `9.90`
   - **Arquivo principal** — o PDF, áudio ou imagem que o cliente vai receber (faça o upload pelo botão de enviar arquivo)
   - *(Opcional)* **Arquivos extras** — se o produto tiver mais de um arquivo (ex: o PDF + um bônus)
3. Salve.

> 💡 Quando o cliente paga, **o arquivo é enviado automaticamente** no WhatsApp dele, com a mensagem que estiver no fluxo. Você não precisa fazer nada.

---

## Etapa 6 — Ligar o produto ao fluxo e ativar

1. Em **"Fluxos"**, encontre o fluxo que você importou e clique no **lápis (✏️)** para editar.
2. O fluxo é uma sequência de **caixinhas** ligadas por linhas. Procure:
   - A caixinha **"Gerar PIX"** — selecione o produto que você cadastrou.
   - A caixinha **"Entrega"** — selecione o mesmo produto.
3. Confira as mensagens das caixinhas e ajuste do seu jeito (ex: o preço, o tom, o nome do produto).
4. Salve.
5. De volta à lista, confira se o fluxo está **ativo** (o botãozinho ao lado do nome deve estar ligado).

### A palavra-chave (keyword)

Cada fluxo tem uma **palavra-chave**: a palavra que faz o robô começar.

- Ex: o template "Desenhos Bíblicos" usa a palavra **"colorir"** — quando alguém manda "colorir" no seu WhatsApp, o robô inicia o fluxo.
- **Coloque essa palavra nos seus anúncios!** Ex: *"Quer o e-book? Chame no WhatsApp e digite COLORIR"*.
- Você pode trocar a palavra-chave no editor do fluxo (campo "Keyword", no topo).

---

## Etapa 7 — Testar antes de anunciar

Sempre teste do início ao fim antes de divulgar:

1. Pegue outro celular (ou peça a um amigo).
2. Mande a palavra-chave para o número conectado.
3. Siga o fluxo: responda "sim", receba o PIX.
4. Pague o PIX (pode ser um valor pequeno) e confira se o arquivo chega.
5. Se algo não sair como esperado, volte ao editor e ajuste.

> 💡 Você também pode mandar mensagem **do próprio número conectado** — nesse caso, o robô não responde (ele ignora mensagens do próprio dono), então o teste deve vir de outro número.

---

## Etapa 8 — Acompanhar suas vendas

- Menu **"Vendas"**: todas as vendas, com status do pagamento (pendente / pago) e entrega.
- Menu **"Relatórios"**: visão geral de desempenho.

---

## Perguntas frequentes

**O robô atende 24 horas?**
Sim. Enquanto o fluxo estiver ativo e o WhatsApp conectado, o robô responde a qualquer hora — inclusive de madrugada e aos fins de semana.

**Onde aparecem as mensagens dos clientes?**
No WhatsApp do número conectado (aba "Aparelhos conectados" no celular). Você vê tudo em tempo real e pode assumir a conversa quando quiser.

**Posso pausar o robô?**
Sim — é só desativar o fluxo na página de Fluxos. Quando quiser, ative de novo.

**E se eu quiser mudar o número conectado?**
Em "WhatsApp & PIX", gere um novo QR Code e conecte outro número. Só lembre: o robô passa a atender o novo número.

**Preciso deixar o computador ligado?**
Não. Tudo roda na nuvem da EZFlow. Você só precisa do celular para escanear o QR Code no início.

**Posso vender mais de um produto?**
Sim! Crie vários fluxos (um por produto), cada um com sua palavra-chave.

**Meu cliente digitou algo que o robô não entendeu. E agora?**
O fluxo responde com uma mensagem amigável e devolve a pergunta. Você também pode responder manualmente quando quiser.

---

## Serviços personalizados (cobrados à parte)

A assinatura da EZFlow inclui o uso completo da plataforma: fluxos ilimitados dentro do seu plano, templates gratuitos, PIX e suporte ao uso.

**Construção de fluxos personalizados** — se você quiser um fluxo sob medida, desenhado pela nossa equipe para o seu produto (mensagens, estratégia de venda, módulo de confiança, remarketing...), esse serviço é **cobrado à parte**, conforme a complexidade.

Para contratar, tirar dúvidas ou pedir ajuda:
**WhatsApp: [número do Nelson]**

---

## Glossário rápido

| Termo | Significado |
|-------|-------------|
| **Fluxo** | A sequência de mensagens e decisões que o robô segue |
| **Keyword** | A palavra que ativa o fluxo quando o cliente envia |
| **QR Code** | O código que você escaneia para conectar o WhatsApp |
| **PIX** | Pagamento instantâneo usado para receber dos clientes |
| **Gateway** | O serviço (Mercado Pago, InfinitePay, PagBank) que processa o pagamento |
| **Token** | A chave de acesso que liga a EZFlow ao seu gateway |
| **Template** | Fluxo pronto, gratuito, que você importa com 1 clique |
| **Produto** | O item digital que o robô entrega após o pagamento |

---

## Checklist rápido

- [ ] Conta criada em ezflow.com.br (7 dias grátis)
- [ ] WhatsApp conectado via QR Code
- [ ] Token do Mercado Pago colado e salvo ("Gateway ativo: Mercado Pago")
- [ ] Fluxo template importado
- [ ] Produto cadastrado (nome, preço, arquivo)
- [ ] Fluxo ligado ao produto e **ativo**
- [ ] Teste completo feito (mensagem → PIX → entrega)
- [ ] Anúncio com a palavra-chave no ar 🚀
