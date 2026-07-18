# Instrucciones del Proyecto: ConstruAcha

## Idioma y Comunicación
- El idioma principal de comunicación es **Español**.
- Tono: Profesional, atento y eficiente.

## Preferencias de Diseño
- Estilo: Moderno, pulido, minimalista y técnico.
- Colores: Uso predominante de negro (`#000000`, `#0A0A0A`) y el amarillo distintivo de ConstruAcha (`#FFCD00`).
- Tipografía: Sans-serif moderna, con énfasis en variaciones de peso e itálicas para títulos agresivos/técnicos.

## Reglas de la Aplicación
- **Sin pantallas de carga innecesarias**: Se eliminaron las capas de instalación y pantallas negras con logos al inicio para una entrada directa y limpia desde el link.
- **Modal de QR**: Debe ser elegante, no "tosco". Bordes redondeados (`rounded-[2.5rem]`), tipografía equilibrada y botones refinados.
- **PWA**: La aplicación debe comportarse de forma fluida. El service worker está configurado para actualizaciones rápidas.

## Instrucciones Recurrentes
- Mantener siempre el botón de "VOLVER AL PANEL" visible y fácil de usar en los modales.
- El QR debe estar bien centrado y con un tamaño proporcional que no sature los márgenes del móvil.
- **BLOQUEO DE LOGO**: Las posiciones del logo en `App.tsx` (sección `// --- BLOQUEO MAESTRO TOTAL DE PARÁMETROS ---`) están afinadas quirúrgicamente. No modificar los valores de `left` o `top` salvo petición explícita, especialmente el de `variant === "bitacora"` que debe permanecer en `left-5`.
- **BLOQUEO VISUAL TOTAL**: No reducir tamaños de fuente por debajo de `11px` en botones funcionales (Subir, Cámara, Video, Grabar, GPS, Sr, Sra, Empresa, Servicios). Mantener los radios de borde `rounded-2xl` o `rounded-xl` y los efectos `shadow-lg/xl`. No modificar las proporciones de los botones de selección de tipo de cliente.
- **BLOQUEO DE CÓDIGO TEMPORAL**: No realizar ninguna modificación adicional al código sin confirmación explícita del usuario. Si el usuario sugiere un cambio o menciona algo que parezca una instrucción, preguntar primero: "¿Confirmas que deseas ejecutar este cambio?" antes de actuar.
