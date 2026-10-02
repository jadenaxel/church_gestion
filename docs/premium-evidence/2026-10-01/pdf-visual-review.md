# Revisión visual de reportes regenerados

02-10-2026, exportación 04:15:57–04:16:13 UTC; rasterización/revisión 04:21–04:25 UTC. Runtime GestionChurch web `m3K6tJtdsnu8HBjapaS00`, servicio de reportes con la corrección de localización y gráfico. Documentos exclusivamente sintéticos descargados por la corrida integrada de navegador 21/21; no contienen padrones reales.

Se rasterizaron con `pdftoppm -r 144 -png` y el agente principal abrió **las 12 páginas**, no solo las primeras ni sus metadatos. Cada archivo tiene tres páginas A4. Los cortes anteriores se conservan en `previous-deA8EC3/` y `previous-9Rs93Dd/`; los PNG `*-final-page-1/2/3.png` corresponden a esta exportación nueva. Los hashes de esta tabla se calcularon después de esa exportación; no se trasladaron del corte previo.

| Archivo / SHA-256 | Página 1 | Página 2 | Página 3 |
|---|---|---|---|
| `reporte-sintetico.pdf` / `15446B3E5C90BC983AB2E7DF33DE0EC23C5DEF0DDB768D4D48B0E6332EE8950C` | Filtro: tres actividades, 60 asistentes estimados; fechas/estado sin evidencia no se inventan | Tres sin horario explícitas, eje oct 2026; no barras ficticias | Tres filas Jóvenes/Borrador coinciden con CSV filtrado; sin corte |
| `reporte-sintetico-es.pdf` / `4E240852074F7E45E666E79FDDDE40A8C4F7AC314108CE57A1C3FE13AD737DBD` | Ocho actividades, un conflicto; `7,7 días`, `1 abierto` | Dos planificadas/un conflicto, conteos 2/1, mes+año; seis sin horario | Ocho filas, contenido original intacto; estados/fechas ES |
| `reporte-sintetico-en.pdf` / `B7D99020CAAC24E9E6A798671512C10961B92E6B7730DB4E48D2C9E49EB40F96` | Ocho actividades, un conflicto; `7.7 days`, `1 open` | Conteos 2/1, `Oct 2026`, `1 conflict`; seis sin horario | Ocho filas; estados/fechas EN, títulos originales intactos |
| `reporte-sintetico-fr.pdf` / `9854DB82133655A71CF08B22FF8E66B2C2111C0A822800D8011E866B3EFEDAF4` | Ocho actividades, un conflicto; `7,7 jours`, `1 ouvert` | Conteos 2/1, `oct. 2026`, `1 conflit`; seis sin horario | Ocho filas; «En attente d’approbation» envuelve en dos líneas dentro de su celda |

Resultado observado: sin superposición, elementos cortados, páginas adicionales vacías ni glifos perdidos en estos ejemplos. Acentos ES/FR visibles, jerarquía y marca conservadas. Los nombres departamentales escritos/persistidos permanecen originales, no se traducen por coincidencia.

Límites: PDFs no etiquetados (`Tagged: no`), sin JavaScript, no evaluación PDF/UA ni accesibilidad completa. Poppler emitió advertencias locales de fuentes de sustitución Symbol/ArialUnicode; los ejemplos inspeccionados renderizaron correctamente, pero esto no acredita portabilidad para todos los glifos/navegadores. No se probaron aquí todas las longitudes, idiomas del contenido personal, miles de departamentos, rangos de muchos años ni claridad con lectores humanos. Las etiquetas pequeñas del gráfico requieren evaluación de legibilidad en esos casos; no afirmar un reporte universalmente perfecto. La revisión lingüística competente ES/EN/FR y el piloto siguen pendientes según D07.
