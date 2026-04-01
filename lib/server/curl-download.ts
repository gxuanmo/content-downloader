import 'server-only';

import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

function getCurlCommand() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

function runCurl(url: string, outFile: string, referer?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '--location',
      '--fail',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '30',
      '--retry',
      '2',
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '--output',
      outFile,
    ];

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    const child = spawn(getCurlCommand(), args, {
      windowsHide: true,
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `curl 下载失败，退出码 ${code}`));
    });
  });
}

export async function downloadWithCurl(url: string, referer?: string): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-downloader-'));
  const outFile = join(tempDir, 'download.bin');

  try {
    await runCurl(url, outFile, referer);
    return await readFile(outFile);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
