import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Guards server-side fetches of admin-supplied URLs (SAML metadata, OIDC
 * discovery) against SSRF.
 *
 * These endpoints are org-admin only, but "admin" here means a customer's
 * administrator, not ours — an admin-supplied URL is still untrusted input to
 * our infrastructure, and a bare `axios.get(url)` on it reaches cloud instance
 * metadata (169.254.169.254), internal service meshes, and anything else our
 * pods can route to.
 *
 * The check is HTTPS-only plus a resolved-address check: the hostname is
 * resolved and every address it maps to must be a public unicast address, so a
 * hostname that resolves to a private range is rejected rather than followed.
 */

/** Set SSO_METADATA_ALLOWED_HOSTS to restrict outbound SSO fetches to named hosts. */
const ALLOWLIST_ENV = 'SSO_METADATA_ALLOWED_HOSTS';

function isBlockedIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local — cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (addr === '::' || addr === '::1') return true; // unspecified, loopback
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local
  if (addr.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — apply the IPv4 rules to the embedded address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true; // unparseable — refuse
}

/**
 * Validates a URL for server-side fetching. Throws BadRequestException if the
 * URL is malformed, not HTTPS, outside the configured allowlist, or resolves to
 * a non-public address. Returns the normalised URL string on success.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  label = 'URL',
): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException(`The ${label} is not a valid URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException(`The ${label} must use HTTPS.`);
  }

  if (url.username || url.password) {
    throw new BadRequestException(
      `The ${label} must not contain embedded credentials.`,
    );
  }

  const allowlist = (process.env[ALLOWLIST_ENV] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  // URL.hostname keeps the brackets on an IPv6 literal (`[::1]`), which
  // `isIP` does not recognise — strip them or every IPv6 literal falls through
  // to the DNS branch and skips the private-address check entirely.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (allowlist.length > 0) {
    const allowed = allowlist.some(
      (entry) => hostname === entry || hostname.endsWith(`.${entry}`),
    );
    if (!allowed) {
      throw new BadRequestException(
        `The ${label} host is not on this deployment's identity-provider allowlist.`,
      );
    }
  }

  // Reject a literal private/loopback address before we spend a DNS lookup.
  if (isIP(hostname) && isBlockedAddress(hostname)) {
    throw new BadRequestException(`The ${label} must point at a public host.`);
  }

  if (!isIP(hostname)) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new BadRequestException(`The ${label} host could not be resolved.`);
    }
    if (
      addresses.length === 0 ||
      addresses.some((a) => isBlockedAddress(a.address))
    ) {
      throw new BadRequestException(
        `The ${label} must point at a public host.`,
      );
    }
  }

  return url.toString();
}
