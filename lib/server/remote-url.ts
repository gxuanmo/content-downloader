import 'server-only';

import { lookup } from 'dns/promises';
import { lookup as dnsLookup, type LookupAddress } from 'dns';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map((item) => Number(item));

  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) {
    return true;
  }

  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 0) return true;

  return false;
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase();

  return (
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  );
}

export function isPrivateAddress(address: string) {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

function isBlockedHostname(hostname: string) {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  );
}

export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS 下载链接');
  }

  const hostname = url.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    throw new Error('不允许访问本地或内网地址');
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('不允许访问本地或内网地址');
    }

    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('不允许访问本地或内网地址');
  }

  return url;
}

export async function resolveSafeAddress(rawUrl: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const url = await assertSafeRemoteUrl(rawUrl);
  const hostname = url.hostname.toLowerCase();

  if (isIP(hostname)) {
    return { url, address: hostname, family: isIP(hostname) as 4 | 6 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const safe = addresses.find((item) => !isPrivateAddress(item.address));

  if (!safe) {
    throw new Error('不允许访问本地或内网地址');
  }

  return { url, address: safe.address, family: safe.family as 4 | 6 };
}

export function createSafeLookup() {
  const lookupFn: any = (hostname: string, options: any, callback: any) => {
    const opts = typeof options === 'function' ? {} : options || {};
    const cb = typeof options === 'function' ? options : callback;

    if (isBlockedHostname(hostname.toLowerCase())) {
      cb(new Error('不允许访问本地或内网地址'));
      return;
    }

    const numericOpts = typeof opts === 'number' ? { family: opts } : opts;
    dnsLookup(hostname, { ...numericOpts, all: true, verbatim: true }, (err, addresses) => {
      if (err) {
        cb(err);
        return;
      }

      const list = (Array.isArray(addresses) ? addresses : [{ address: addresses as unknown as string, family: 4 }]) as LookupAddress[];

      if (list.length === 0 || list.some((item) => isPrivateAddress(item.address))) {
        cb(new Error('不允许访问本地或内网地址'));
        return;
      }

      if (numericOpts.all) {
        cb(null, list);
        return;
      }

      const first = list[0];
      cb(null, first.address, first.family);
    });
  };
  return lookupFn;
}
