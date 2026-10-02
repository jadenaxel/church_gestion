import SwaggerParser from '@apidevtools/swagger-parser';
import { openApiDocument } from '../services/api-gateway/src/openapi.js';

await SwaggerParser.validate(openApiDocument as never);
console.log(`OpenAPI válido: ${Object.keys(openApiDocument.paths).length} rutas.`);
