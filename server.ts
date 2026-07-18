import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para analizar JSON con límite grande (para fotos/videos base64)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API para procesamiento de Gemini seguro en el servidor
  app.post("/api/gemini", async (req, res) => {
    try {
      const { prompt, model, history, media, role } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "La clave GEMINI_API_KEY no está configurada en las variables de entorno del servidor." 
        });
      }

      // Inicialización moderna de GoogleGenAI según el skill oficial
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
         // Configuración estricta de prompts de sistema según el rol
      let systemInstruction = "";
      if (role === "admin") {
        systemInstruction = `Eres el CENTRO DE MANDO IA de ConstruAcha. Un asistente analítico y de gestión interna altamente avanzado, reservado exclusivamente para el Administrador de ConstruAcha.
-- Tu tono es extremadamente directo, profesional, conciso y al grano.
-- REGLA DE ORO DE BREVEDAD Y CONCRECIÓN: Responde de forma sumamente puntual y directa, sin introducciones largas, saludos excesivos ni explicaciones innecesarias. Ve directo al cálculo o respuesta.
-- CÁLCULOS TÉCNICOS SÚPER DIRECTOS: Si te piden un cálculo (ej. bloques para una pared de 3x3):
  1. Da el resultado exacto inmediatamente de forma clara y esquemática (ej. "Para una pared de 3x3m (9m²), usando bloques estándar de 15x20x40cm rinde 12.5 bloques por m². Total: 113 bloques (más un 5% de desperdicio = 119 bloques).").
  2. Si falta algún detalle (como el tamaño del bloque o espesor de la pared), dilo en una sola frase breve y pregunta las opciones de manera muy simple: "¿Vas a usar bloques de 15cm (el más común), de 10cm o de 12cm?".
-- Tienes acceso total y libertad de discutir tarifas, precios sugeridos, presupuestos e indicadores de negocio sin restricciones de precios.`;
      } else {
        systemInstruction = `Eres el NÚCLEO CONSTRUACHA IA, un asesor técnico exclusivo, sumamente amable pero muy directo para los clientes de ConstruAcha.
-- REGLA DE ORO DE BREVEDAD: Tus respuestas deben ser sumamente concretas, breves y al grano. Evita textos largos, introducciones decorativas o saludos interminables. Responde en el menor número de líneas posible.
-- CÁLCULOS TÉCNICOS SÚPER DIRECTOS: Cuando te pregunten por cálculos de materiales (ej. bloques para una pared):
  1. Da el cálculo directo de manera inmediata con base en las medidas estándar (ej. "Para una pared de 3x3m (9m²), si usas el bloque estándar de 15x20x40cm, necesitas aproximadamente 113 bloques (119 con 5% de desperdicio).").
  2. O bien, si prefieres aclaración previa, indícalo de forma ultra-concisa: "Para calcular con exactitud, ¿qué medida de bloque vas a utilizar? Las más comunes son: de 10cm, 12cm o 15cm de ancho. (Por defecto, para 9m² con bloque estándar de 15cm necesitas ~113 bloques).".
-- SÉ AMABLE PERO DIRECTO. No des discursos ni explicaciones constructivas largas a menos que te las pidan explícitamente.
-- REGLA DE EXCLUSIVIDAD TÉCNICA (PROHIBIDO DAR PRECIOS): Tienes ESTRICTAMENTE PROHIBIDO dar precios, costos monetarios o presupuestos financieros en dinero. Si el cliente te pregunta "cuánto cuesta" o similar, di de manera ultra-breve: "Como asesor técnico no manejo valores comerciales. Te invito cordialmente a usar el 'Generador de Presupuestos' de ConstruAcha aquí mismo en la app para calcular tus costos al instante con un solo toque."
-- SI EL USUARIO PIDE UN REDISEÑO O RECREACIÓN VISUAL: Sé muy breve (máximo 2 frases) y enfócate solo en la propuesta de estilo.`;
      }

      // Mapeamos el modelo a los recomendados en el skill oficial
      let activeModel = "gemini-3.5-flash";
      if (model === "gemini-1.5-pro") {
        activeModel = "gemini-3.1-pro-preview";
      }

      // Construcción del historial de contenidos
      const contents: any[] = [];
      
      if (history && Array.isArray(history)) {
        // Añadimos mensajes anteriores
        history.forEach((msg: any) => {
          if (msg.role && msg.parts) {
            const formattedParts = msg.parts.map((p: any) => {
              if (p.inlineData) {
                return {
                  inlineData: {
                    mimeType: p.inlineData.mimeType,
                    data: p.inlineData.data.includes('base64,') ? p.inlineData.data.split('base64,')[1] : p.inlineData.data
                  }
                };
              }
              return { text: p.text || "" };
            });
            contents.push({ role: msg.role === "model" ? "model" : "user", parts: formattedParts });
          }
        });
      }

      // Añadimos el mensaje actual
      const currentParts: any[] = [{ text: prompt || "" }];
      if (media && Array.isArray(media)) {
        media.forEach((m: any) => {
          const base64Data = m.data.includes('base64,') ? m.data.split('base64,')[1] : m.data;
          currentParts.push({
            inlineData: {
              mimeType: m.mimeType,
              data: base64Data
            }
          });
        });
      }

      contents.push({ role: "user", parts: currentParts });

      // Sistema robusto de reintentos con fallback de modelo inteligente (resuelve 503 Overloaded y 429 Quotas)
      let response;
      let lastApiError: any = null;
      const modelsToTry = [activeModel];
      
      // Si el primer modelo es el Pro (debido a la selección del Admin), añadimos Flash como fallback.
      // Si el primer modelo es Flash, añadimos Pro como fallback secundario.
      if (activeModel === "gemini-3.1-pro-preview") {
        modelsToTry.push("gemini-3.5-flash");
      } else {
        modelsToTry.push("gemini-3.1-pro-preview");
      }

      for (const currentModel of modelsToTry) {
        let retries = 3;
        let delay = 1000; // 1 segundo inicial
        
        while (retries > 0) {
          try {
            console.log(`[CONSTRUACHA-IA] Llamando a Gemini con modelo: ${currentModel} (${retries} intentos restantes)`);
            response = await ai.models.generateContent({
              model: currentModel,
              contents: contents,
              config: {
                systemInstruction: systemInstruction,
                temperature: role === "admin" ? 0.35 : 0.45,
              }
            });
            break; // Éxito total, salimos de los reintentos
          } catch (err: any) {
            lastApiError = err;
            console.warn(`[CONSTRUACHA-IA] Error en modelo ${currentModel}: ${err.message || err}`);
            
            // Verificamos si es un error temporal por saturación de servidores de Google o cuotas
            const isTemporary = err.message?.includes('503') || 
                                err.message?.includes('429') || 
                                err.message?.includes('LIMIT') || 
                                err.message?.includes('RESOURCE_EXHAUSTED') || 
                                err.message?.includes('demand') || 
                                err.message?.includes('overloaded') ||
                                err.message?.includes('temporary');
                                
            if (isTemporary && retries > 1) {
              console.log(`[CONSTRUACHA-IA] Sobrecarga detectada. Reintentando en ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 1.5; // Backoff incremental
              retries--;
            } else {
              break; // No es temporal o se agotaron los intentos para este modelo, probamos el fallback
            }
          }
        }
        
        if (response) {
          break; // Éxito con este modelo, salimos de la selección
        }
      }

      if (!response) {
        throw lastApiError || new Error("No se pudo establecer comunicación con los motores de IA de Google tras múltiples intentos.");
      }

      const text = response.text;

      if (!text) {
        return res.status(500).json({ error: "Respuesta de IA vacía del modelo." });
      }

      return res.json({ text });
    } catch (error: any) {
      console.error("Error en API de Gemini:", error);
      return res.status(500).json({ 
        error: error.message || "Ocurrió un error al procesar la solicitud de IA en el servidor." 
      });
    }
  });

  // Integración de Vite o Archivos Estáticos
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor ConstruAcha corriendo en el puerto ${PORT}`);
  });
}

startServer();
