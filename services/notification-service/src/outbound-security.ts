import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPublicNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPublicNetworkAddress(mapped);
    // Hex-encoded mapped IPv4 is not needed as an outbound public endpoint.
    return false;
  }
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b))
      || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Public IPv6 global-unicast only; excludes loopback, link-local, ULA,
  // multicast, translation/tunneling mechanisms and documentation ranges.
  return isIP(address) === 6 && /^[23]/.test(normalized)
    && !normalized.startsWith('2001:db8:') && !normalized.startsWith('2001:0:')
    && !normalized.startsWith('2002:');
}

export async function resolveSmtpTarget(host: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env.NODE_ENV !== 'production') return host;
  const allowedPrivateHosts = (env.SMTP_PRIVATE_HOST_ALLOWLIST ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || (!allowedPrivateHosts.includes(host.toLowerCase()) && addresses.some((entry) => !isPublicNetworkAddress(entry.address)))) {
    throw new Error('El servidor SMTP apunta a una red privada o reservada no autorizada por el despliegue.');
  }
  // Pin the checked address to prevent DNS rebinding between validation and send.
  return addresses[0]!.address;
}
