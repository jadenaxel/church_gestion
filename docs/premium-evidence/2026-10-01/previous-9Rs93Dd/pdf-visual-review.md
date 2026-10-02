# Revisión visual de reportes regenerados

02-10-2026, 03:20–03:21 UTC. Runtime GestionChurch web `9Rs93DdT6H9Go53CnWtsV`, servicio de reportes con la corrección de localización y gráfico. Documentos exclusivamente sintéticos descargados por la corrida integrada de navegador 19/19; no contienen padrones reales.

Se rasterizaron con `pdftoppm -r 144 -png` y el agente principal abrió **las 12 páginas**, no solo las primeras ni sus metadatos. Cada archivo tiene tres páginas A4. La comparación anterior se conserva en `previous-deA8EC3/`; los PNG `*-final-page-1/2/3.png` corresponden a esta exportación nueva.

| Archivo / SHA-256 | Página 1 | Página 2 | Página 3 |
|---|---|---|---|
| `reporte-sintetico.pdf` / `A1046D2607BF98B5AEC2E2884410335D84A50AACC274AD601EFDF4CBFB21A05F` | Filtro: tres actividades, 60 asistentes estimados; fechas/estado sin evidencia no se inventan | Tres sin horario explícitas, eje oct 2026; no barras ficticias | Tres filas Jóvenes/Borrador coinciden con CSV filtrado; sin corte |
| `reporte-sintetico-es.pdf` / `498287A4F52F2E6916E56D8DC1D045CDB77654768A2AEBDAFF306D02197094FA` | Ocho actividades, un conflicto; `6,8 días`, `1 abierto` | Dos planificadas/un conflicto, conteos 2/1, mes+año; seis sin horario | Ocho filas, contenido original intacto; estados/fechas ES |
| `reporte-sintetico-en.pdf` / `305A0537279246C4AD6466374D65F0C3234C1E5A658820AE7AF7E708CD13F0C2` | Ocho actividades, un conflicto; `6.8 days`, `1 open` | Conteos 2/1, `Oct 2026`, `1 conflict`; seis sin horario | Ocho filas; estados/fechas EN, títulos originales intactos |
| `reporte-sintetico-fr.pdf` / `A271D9D22F6E9C89889C85287C51BB946ECA018B1070FCB5F8179679ABC2A8D2` | Ocho actividades, un conflicto; `6,8 jours`, `1 ouvert` | Conteos 2/1, `oct. 2026`, `1 conflit`; seis sin horario | Ocho filas; «En attente d’approbation» envuelve en dos líneas dentro de su celda |

Resultado observado: sin superposición, elementos cortados, páginas adicionales vacías ni glifos perdidos en estos ejemplos. Acentos ES/FR visibles, jerarquía y marca conservadas. Los nombres departamentales escritos/persistidos permanecen originales, no se traducen por coincidencia.

Límites: PDFs no etiquetados (`Tagged: no`), sin JavaScript, no evaluación PDF/UA ni accesibilidad completa. Poppler emitió advertencias locales de fuentes de sustitución Symbol/ArialUnicode; los ejemplos inspeccionados renderizaron correctamente, pero esto no acredita portabilidad para todos los glifos/navegadores. No se probaron aquí todas las longitudes, idiomas del contenido personal, miles de departamentos, rangos de muchos años ni claridad con lectores humanos. Las etiquetas pequeñas del gráfico requieren evaluación de legibilidad en esos casos; no afirmar un reporte universalmente perfecto. La revisión lingüística competente ES/EN/FR y el piloto siguen pendientes según D07.
