# Accesibilidad

La interfaz se diseñó para WCAG 2.2 AA:

- landmarks y encabezados semánticos;
- labels asociados a inputs;
- foco visible;
- objetivos táctiles de al menos 44 px en acciones principales;
- conflicto expresado con texto/icono, no solo color;
- navegación móvil inferior;
- `prefers-reduced-motion`;
- diseño automatizado a 360 × 800, 390 × 844 y en escritorio;
- contraste alto sobre superficies y estados.

`pnpm test:browser` ejecuta Chromium en escritorio y móvil a 360/390 px, recorre autenticación, dashboard, calendario y formulario, y aplica axe-core con reglas WCAG A/AA. El 26 de septiembre de 2026 pasaron 6/6 pruebas sin violaciones críticas o serias en el recorrido principal. Antes de producción aún corresponde una validación humana con NVDA/VoiceOver y navegación completa solo con teclado.
