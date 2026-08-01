/**
 * Evolution API Client
 *
 * Evolution API é um servidor open-source que conecta ao WhatsApp via Baileys (QR Code).
 * Ele expõe uma API REST para enviar/receber mensagens, gerenciar instâncias, etc.
 *
 * Docs: https://doc.evolution-api.com
 */

interface EvolutionConfig {
  baseUrl: string; // URL da Evolution API (ex: http://localhost:8080)
  apikey: string; // API Key configurada na Evolution
  instance: string; // Nome da instância (ex: "default")
}

interface SendTextParams {
  number: string; // Número do destinatário (5531999999999)
  text: string;
  delay?: number;
}

interface SendMediaParams {
  number: string;
  mediaType: "image" | "audio" | "document" | "video";
  mediaUrl: string;
  caption?: string;
  fileName?: string;
}

interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    audioMessage?: { url: string; mimetype: string };
    imageMessage?: { url: string; caption?: string };
    documentMessage?: { url: string; fileName?: string };
  };
  pushName?: string;
  messageTimestamp: number;
}

interface EvolutionWebhook {
  event: string; // "messages.upsert"
  instance: string;
  data: {
    key: EvolutionMessage["key"];
    message: EvolutionMessage["message"];
    pushName: string;
    messageType: string;
    messageTimestamp: number;
  };
}

export class EvolutionClient {
  private config: EvolutionConfig;

  constructor(config: EvolutionConfig) {
    this.config = config;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      apikey: this.config.apikey,
    };
  }

  private url(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, "");
    return `${base}${path}`;
  }

  /**
   * Cria uma nova instância WhatsApp
   */
  async createInstance(instanceName?: string): Promise<{ qrcode?: string }> {
    const instance = instanceName || this.config.instance;
    const res = await fetch(this.url(`/instance/create`), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        instanceName: instance,
        token: this.config.apikey,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Evolution createInstance failed: ${res.status} ${await res.text()}`
      );
    }

    return res.json();
  }

  /**
   * Conecta a instância (gera QR Code se necessário)
   */
  async connectInstance(
    instanceName?: string
  ): Promise<{ qrcode?: string }> {
    const instance = instanceName || this.config.instance;
    const res = await fetch(
      this.url(`/instance/connect/${instance}`),
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new Error(
        `Evolution connectInstance failed: ${res.status} ${await res.text()}`
      );
    }

    return res.json();
  }

  /**
   * Verifica status da instância
   */
  async getInstanceStatus(
    instanceName?: string
  ): Promise<{ instance: { state: string } }> {
    const instance = instanceName || this.config.instance;
    const res = await fetch(
      this.url(`/instance/connectionState/${instance}`),
      {
        method: "GET",
        headers: this.headers,
      }
    );

    if (!res.ok) {
      throw new Error(
        `Evolution status failed: ${res.status} ${await res.text()}`
      );
    }

    return res.json();
  }

  /**
   * Configura o webhook para receber mensagens
   */
  async setWebhook(webhookUrl: string, events: string[] = ["MESSAGES_UPSERT"]) {
    const instance = this.config.instance;
    const res = await fetch(this.url(`/webhook/set/${instance}`), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        events,
        webhookBase64: false,
        webhookByEvents: true,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Evolution setWebhook failed: ${res.status} ${await res.text()}`
      );
    }

    return res.json();
  }

  /**
   * Envia mensagem de texto
   */
  async sendText(params: SendTextParams) {
    const instance = this.config.instance;
    const res = await fetch(
      this.url(`/message/sendText/${instance}`),
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          number: params.number,
          text: params.text,
          delay: params.delay || 0,
        }),
      }
    );

    const data = await res.json();
    console.log(`[EVO] sendText to=${params.number.slice(-6)} ok=${res.ok} status=${res.status} resp=${JSON.stringify(data).slice(0, 100)}`);
    if (!res.ok) {
      throw new Error(`Evolution sendText failed: ${res.status} ${JSON.stringify(data)}`);
    }
    return data;
  }

  /**
   * Envia mídia (imagem, áudio, documento, vídeo)
   */
  async sendMedia(params: SendMediaParams) {
    const instance = this.config.instance;
    const res = await fetch(
      this.url(`/message/sendMedia/${instance}`),
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          number: params.number,
          mediatype: params.mediaType,
          media: params.mediaUrl,
          caption: params.caption,
          fileName: params.fileName,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(
        `Evolution sendMedia failed: ${res.status} ${await res.text()}`
      );
    }

    return res.json();
  }

  /**
   * Envia documento (PDF, etc.)
   */
  async sendDocument(number: string, fileUrl: string, fileName: string) {
    return this.sendMedia({
      number,
      mediaType: "document",
      mediaUrl: fileUrl,
      fileName,
    });
  }

  /**
   * Envia PIX Copia-e-Cola como texto
   */
  async sendPix(number: string, pixCopyPaste: string, value: number) {
    const text = `💳 *Pagamento via PIX*\n\nValor: R$ ${value.toFixed(2)}\n\n*PIX Copia e Cola:*\n\`\`\`${pixCopyPaste}\`\`\`\n\nCopie o código acima e cole no app do seu banco para pagar.`;
    return this.sendText({ number, text });
  }
}

// Helpers para processar webhooks
export function parseEvolutionWebhook(
  body: any
): {
  phone: string;
  message: string;
  messageId: string;
  messageType: string;
  pushName?: string;
  instance?: string;
} | null {
  try {
    const event = body?.event;
    if (event !== "messages.upsert") return null;

    const msg = body?.data;
    if (!msg?.key?.remoteJid) return null;

    // Ignorar mensagens enviadas por nós mesmos
    if (msg.key.fromMe) return null;

    const phone = msg.key.remoteJid.replace(/@s\.whatsapp\.net$/, "");
    const messageType = msg.messageType || "conversation";
    const pushName = msg.pushName;
    const instance = body.instance;

    // Extrair texto da mensagem
    let message = "";
    if (msg.message?.conversation) {
      message = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      message = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
      message = msg.message.imageMessage.caption;
    } else if (msg.message?.documentMessage?.caption) {
      message = msg.message.documentMessage.caption;
    }

    return {
      phone,
      message,
      messageId: msg.key.id,
      messageType,
      pushName,
      instance,
    };
  } catch (error) {
    console.error("Error parsing Evolution webhook:", error);
    return null;
  }
}
