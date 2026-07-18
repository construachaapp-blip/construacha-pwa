export enum GeminiModel {
  PRO = "gemini-1.5-pro",
  FLASH = "gemini-1.5-flash",
}

export interface Message {
  role: 'user' | 'model';
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

export interface AIResponse {
  text: string;
  image?: { mimeType: string; data: string };
}

export const generateAIResponse = async (
  prompt: string,
  model: GeminiModel = GeminiModel.FLASH,
  history: Message[] = [],
  media?: { mimeType: string; data: string }[],
  role: 'client' | 'admin' = 'client'
): Promise<AIResponse> => {
  const MAX_RETRIES = 3;
  let lastError: any = null;

  // Selección del modelo: Respetamos la selección del usuario/administración (Flash por defecto, Pro si está configurado)
  const activeModel = model;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          model: activeModel,
          history,
          media,
          role,
        }),
      });

      if (!response.ok) {
        let errText = "";
        try {
          const errData = await response.json();
          errText = errData.error || errData.message;
        } catch (e) {
          errText = await response.text();
        }
        throw new Error(errText || `Error del servidor (${response.status})`);
      }

      const data = await response.json();
      if (!data.text) {
        throw new Error("La respuesta del servidor no contiene texto.");
      }

      return { text: data.text };
    } catch (error: any) {
      lastError = error;
      const errorStr = String(error);
      const isRetryable = errorStr.includes('429') || errorStr.includes('500') || errorStr.includes('Quota');
      
      if (isRetryable && i < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      break;
    }
  }
  throw lastError;
};
