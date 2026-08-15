import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export interface FetchResult {
  status: number;
  url: string;
  body: string;
  error?: string;
}

export interface DownloadResult {
  status: number;
  size?: number;
  filepath?: string;
  error?: string;
}

export class HttpClient {
  private readonly scriptPath: string;
  private readonly pythonBin: string;

  constructor() {
    this.scriptPath = join(__dirname, '..', '..', 'scripts', 'fetch.py');
    this.pythonBin = process.env.PYTHON_BIN || 'python3';
  }

  async fetch(
    url: string,
    headers?: Record<string, string>,
  ): Promise<FetchResult> {
    const args = [this.scriptPath, 'fetch', url];
    if (headers) {
      args.push(JSON.stringify(headers));
    }
    const { stdout } = await execFileAsync(this.pythonBin, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });
    return JSON.parse(stdout);
  }

  async download(
    url: string,
    filepath: string,
    headers?: Record<string, string>,
    timeoutSec = 10,
  ): Promise<DownloadResult> {
    const args = [this.scriptPath, 'download', url, filepath];
    args.push(JSON.stringify(headers || {}));
    args.push(String(timeoutSec));
    const { stdout } = await execFileAsync(this.pythonBin, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: timeoutSec * 1000 + 5000,
    });
    return JSON.parse(stdout);
  }
}
