import { SpanStatusCode, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let telemetrySdk: NodeSDK | null = null;

export function initializeTelemetry(serviceName: string): void {
  const baseUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!baseUrl || telemetrySdk) return;
  const traceUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? `${baseUrl.replace(/\/$/, '')}/v1/traces`;
  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName, [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? '0.1.0' }),
    traceExporter: new OTLPTraceExporter({ url: traceUrl }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }
    })]
  });
  telemetrySdk.start();
  process.once('SIGTERM', () => void telemetrySdk?.shutdown());
  process.once('SIGINT', () => void telemetrySdk?.shutdown());
}

export function requestSpan(serviceName: string, method: string, route: string) {
  return trace.getTracer(serviceName).startSpan(`${method} ${route}`, {
    attributes: { 'http.request.method': method, 'http.route': route }
  });
}

export function finishRequestSpan(span: ReturnType<typeof requestSpan>, status: number, durationMs: number): void {
  span.setAttribute('http.response.status_code', status);
  span.setAttribute('http.server.request.duration_ms', durationMs);
  if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}
