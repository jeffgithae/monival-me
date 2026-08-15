import { BadRequestException } from '@nestjs/common';
import { assertSafeOutboundUrl } from './safe-outbound-url';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const { lookup } = require('node:dns/promises') as { lookup: jest.Mock };

describe('assertSafeOutboundUrl', () => {
  const ALLOWLIST_ENV = 'SSO_METADATA_ALLOWED_HOSTS';

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[ALLOWLIST_ENV];
    lookup.mockResolvedValue([{ address: '93.184.216.34' }]);
  });

  it('accepts a public HTTPS URL', async () => {
    await expect(
      assertSafeOutboundUrl('https://login.example.com/metadata'),
    ).resolves.toContain('login.example.com');
  });

  it.each([
    ['http://login.example.com/metadata', 'plain HTTP'],
    ['file:///etc/passwd', 'a non-HTTP scheme'],
    ['not a url', 'a malformed URL'],
    ['https://user:pass@login.example.com/', 'embedded credentials'],
  ])('rejects %s (%s)', async (url) => {
    await expect(assertSafeOutboundUrl(url)).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each([
    'https://169.254.169.254/latest/meta-data/', // cloud instance metadata
    'https://127.0.0.1/metadata', // loopback
    'https://10.0.0.5/metadata', // RFC1918
    'https://172.16.4.2/metadata', // RFC1918
    'https://192.168.1.10/metadata', // RFC1918
    'https://100.64.0.1/metadata', // CGNAT
    'https://[::1]/metadata', // IPv6 loopback
    'https://[fd00::1]/metadata', // IPv6 unique-local
  ])('rejects the literal private address %s', async (url) => {
    await expect(assertSafeOutboundUrl(url)).rejects.toThrow(
      BadRequestException,
    );
    // Refused before any DNS work — nothing to resolve for a literal address.
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves into a private range', async () => {
    // The DNS-rebinding shape: a public-looking name pointing at internal space.
    lookup.mockResolvedValue([{ address: '169.254.169.254' }]);

    await expect(
      assertSafeOutboundUrl('https://metadata.attacker.test/'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when any resolved address is private, not just the first', async () => {
    lookup.mockResolvedValue([
      { address: '93.184.216.34' },
      { address: '10.1.2.3' },
    ]);

    await expect(
      assertSafeOutboundUrl('https://mixed.example.com/'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a hostname that does not resolve', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(
      assertSafeOutboundUrl('https://nope.example.com/'),
    ).rejects.toThrow(BadRequestException);
  });

  describe('with an allowlist configured', () => {
    beforeEach(() => {
      process.env[ALLOWLIST_ENV] =
        'login.microsoftonline.com, accounts.google.com';
    });

    it('accepts an allowlisted host', async () => {
      await expect(
        assertSafeOutboundUrl(
          'https://accounts.google.com/.well-known/openid-configuration',
        ),
      ).resolves.toBeTruthy();
    });

    it('accepts a subdomain of an allowlisted host', async () => {
      await expect(
        assertSafeOutboundUrl('https://eu.accounts.google.com/x'),
      ).resolves.toBeTruthy();
    });

    it('rejects a host outside the allowlist', async () => {
      await expect(
        assertSafeOutboundUrl('https://idp.example.com/'),
      ).rejects.toThrow(BadRequestException);
    });

    it('is not fooled by a suffix that is not a subdomain', async () => {
      await expect(
        assertSafeOutboundUrl('https://evilaccounts.google.com.attacker.test/'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
