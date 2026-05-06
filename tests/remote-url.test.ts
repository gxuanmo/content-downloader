import { describe, expect, it } from 'vitest';

import {
  RemoteUrlError,
  assertSafeRemoteUrl,
  isPrivateAddress,
} from '@/lib/server/remote-url';

describe('isPrivateAddress (IPv4)', () => {
  const cases: Array<[string, boolean]> = [
    ['127.0.0.1', true],
    ['10.0.0.1', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.15.0.1', false],
    ['172.32.0.1', false],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['100.127.255.255', true],
    ['100.128.0.1', false],
    ['0.0.0.1', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
  ];

  for (const [ip, expected] of cases) {
    it(`${ip} → ${expected}`, () => {
      expect(isPrivateAddress(ip)).toBe(expected);
    });
  }
});

describe('isPrivateAddress (IPv6)', () => {
  const cases: Array<[string, boolean]> = [
    ['::1', true],
    ['::', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:10.0.0.1', true],
    ['::ffff:192.168.1.1', true],
    ['::ffff:172.16.0.1', true],
    // The bug ultrareview caught: previously slipped through.
    ['::ffff:169.254.169.254', true],
    ['::ffff:0.0.0.0', true],
    ['::ffff:100.64.0.1', true],
    // IPv4-compatible legacy form.
    ['::127.0.0.1', true],
    ['::8.8.8.8', false],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['64:ff9b::1.2.3.4', true],
    ['2001:4860:4860::8888', false],
    ['2606:4700:4700::1111', false],
  ];

  for (const [ip, expected] of cases) {
    it(`${ip} → ${expected}`, () => {
      expect(isPrivateAddress(ip)).toBe(expected);
    });
  }
});

describe('assertSafeRemoteUrl', () => {
  it('rejects file:// scheme', async () => {
    await expect(assertSafeRemoteUrl('file:///etc/passwd')).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects javascript: scheme', async () => {
    await expect(assertSafeRemoteUrl('javascript:alert(1)')).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects loopback hostname', async () => {
    await expect(assertSafeRemoteUrl('http://localhost/foo')).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects IPv4 loopback literal', async () => {
    await expect(assertSafeRemoteUrl('http://127.0.0.1/foo')).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects IPv6 IMDS via ::ffff: literal', async () => {
    await expect(
      assertSafeRemoteUrl('http://[::ffff:169.254.169.254]/latest/meta-data/')
    ).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects IPv6 unspecified literal', async () => {
    await expect(assertSafeRemoteUrl('http://[::]/foo')).rejects.toBeInstanceOf(RemoteUrlError);
  });

  it('rejects IPv4-compatible IPv6 loopback', async () => {
    await expect(assertSafeRemoteUrl('http://[::127.0.0.1]/foo')).rejects.toBeInstanceOf(
      RemoteUrlError
    );
  });

  it('rejects .internal hostname', async () => {
    await expect(assertSafeRemoteUrl('http://service.internal/foo')).rejects.toBeInstanceOf(
      RemoteUrlError
    );
  });

  it('rejects .local hostname', async () => {
    await expect(assertSafeRemoteUrl('http://printer.local/foo')).rejects.toBeInstanceOf(
      RemoteUrlError
    );
  });
});
