import 'server-only';

import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

import { resolveSafeAddress } from './remote-url';

function getCurlCommand() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

interface CurlResult {
  buffer: Buffer;
  statusCode: number;
  contentType: string;
}

function runCurl(
  url: string,
  headerFile: string,
  resolveOverride: string | undefined,
  referer: string | undefined,
  maxBytes: number
): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--connect-timeout',
      '30',
      '--max-time',
      '300',
      '--retry',
      '2',
      '--max-redirs',
      '0',
      '--max-filesize',
      String(maxBytes),
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '--dump-header',
      headerFile,
      '-o',
      '-',
    ];

    if (resolveOverride) {
      args.push('--resolve', resolveOverride);
    }

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    const child = spawn(getCurlCommand(), args, {
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    let received = 0;
    let stderrBuf = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      received += chunk.byteLength;
      if (received > maxBytes) {
        try {
          child.kill('SIGKILL');
        } catch {}
        finish(() => reject(new Error(`下载体积超过限制 (${maxBytes} 字节)`)));
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('close', async (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(() => reject(new Error(stderrBuf.trim() || `curl 下载失败，退出码 ${code}`)));
        return;
      }
      let statusCode = 0;
      let contentType = '';
      try {
        const headerText = await readFile(headerFile, 'utf8');
        const lines = headerText.split(/\r?\n/);
        for (const line of lines) {
          const statusMatch = line.match(/^HTTP\/[\d.]+\s+(\d{3})/);
          if (statusMatch) statusCode = Number(statusMatch[1]);
          const ctMatch = line.match(/^content-type:\s*(.+)$/i);
          if (ctMatch) contentType = ctMatch[1].trim();
        }
      } catch {}
      finish(() =>
        resolve({
          buffer: Buffer.concat(chunks),
          statusCode,
          contentType,
        })
      );
    });
  });
}

export async function downloadWithCurl(
  rawUrl: string,
  referer: string | undefined,
  maxBytes: number
): Promise<Buffer> {
  const { url, address } = await resolveSafeAddress(rawUrl);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const resolveOverride = `${url.hostname}:${port}:${address}`;

  const tempDir = await mkdtemp(join(tmpdir(), 'content-downloader-'));
  const headerFile = join(tempDir, 'headers.txt');

  try {
    const { buffer, statusCode, contentType } = await runCurl(
      url.toString(),
      headerFile,
      resolveOverride,
      referer,
      maxBytes
    );
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`上游返回 ${statusCode}，已拒绝（不跟随重定向）`);
    }
    if (contentType.toLowerCase().includes('text/html')) {
      throw new Error('上游返回的是 HTML 页面，不是可下载的媒体文件');
    }
    if (buffer.byteLength > maxBytes) {
      throw new Error(`下载体积超过限制 (${maxBytes} 字节)`);
    }
    return buffer;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
