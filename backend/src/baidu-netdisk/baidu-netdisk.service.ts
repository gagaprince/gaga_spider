import { Injectable, Logger } from '@nestjs/common';
import { spawn, execFileSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SettingsService } from '../settings/settings.service';

export interface BaiduNetdiskConfig {
  enabled: boolean;
  remoteBasePath: string;
}

export interface UploadResult {
  localPath: string;
  remotePath: string;
  size: number;
}

export interface UploadBatchResult {
  uploaded: UploadResult[];
  failed: { localPath: string; error: string }[];
}

export interface CliStatus {
  installed: boolean;
  loggedIn: boolean;
  version: string | null;
  error: string | null;
}

export type ProgressCallback = (data: {
  type: 'file-progress' | 'file-done' | 'file-error' | 'batch-progress' | 'log';
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
  remotePath?: string;
  localPath?: string;
}) => void;

const CONFIG_FILE = path.join(os.homedir(), '.baidupan-cli', 'config.json');

@Injectable()
export class BaiduNetdiskService {
  private readonly logger = new Logger(BaiduNetdiskService.name);
  private readonly bin = 'baidupan-cli';

  constructor(private readonly settingsService: SettingsService) {}

  getConfig(): BaiduNetdiskConfig {
    return {
      enabled: this.settingsService.baiduNetdiskEnabled,
      remoteBasePath: this.settingsService.baiduNetdiskPath,
    };
  }

  checkCli(): CliStatus {
    try {
      const version = execFileSync(this.bin, ['--version'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      let loggedIn = false;
      try {
        if (existsSync(CONFIG_FILE)) {
          const raw = readFileSync(CONFIG_FILE, 'utf-8');
          const config = JSON.parse(raw) as {
            access_token?: string;
            refresh_token?: string;
          };
          loggedIn = !!(config.access_token && config.refresh_token);
        }
      } catch {
        loggedIn = false;
      }

      return { installed: true, loggedIn, version, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/ENOENT|not found|command not found/i.test(msg)) {
        return {
          installed: false,
          loggedIn: false,
          version: null,
          error: '未找到 baidupan-cli，请先安装: npm install -g baidupan-cli',
        };
      }
      return {
        installed: true,
        loggedIn: false,
        version: null,
        error: msg,
      };
    }
  }

  /**
   * 上传单个文件，通过 onProgress 回调实时推送分片进度。
   */
  uploadFileWithProgress(
    localAbsPath: string,
    remotePath: string,
    onProgress?: ProgressCallback,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      if (!existsSync(localAbsPath)) {
        reject(new Error(`本地文件不存在: ${localAbsPath}`));
        return;
      }
      const size = statSync(localAbsPath).size;

      this.logger.log(`上传: ${localAbsPath} -> ${remotePath}`);

      const args = ['upload', localAbsPath, remotePath];
      const child = spawn(this.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderrBuf = '';
      let lastPercent = -1;

      const parseProgressLine = (line: string) => {
        // 格式: 上传中: [████░░░░] 55% (11/20)
        const match = line.match(/(\d+)%\s*\((\d+)\/(\d+)\)/);
        if (match) {
          const percent = parseInt(match[1], 10);
          const current = parseInt(match[2], 10);
          const total = parseInt(match[3], 10);
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress?.({
              type: 'file-progress',
              percent,
              current,
              total,
            });
          }
        }
      };

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuf += text;
        // 按 \r 或 \n 分割进度行
        const lines = stderrBuf.split(/[\r\n]/);
        stderrBuf = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) parseProgressLine(line);
        }
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          onProgress?.({ type: 'log', message: text });
        }
      });

      child.on('close', (code) => {
        // 处理缓冲区中剩余的数据
        if (stderrBuf.trim()) parseProgressLine(stderrBuf);

        if (code === 0) {
          onProgress?.({
            type: 'file-done',
            percent: 100,
            remotePath,
          });
          this.logger.log(`上传成功: ${remotePath}`);
          resolve({ localPath: localAbsPath, remotePath, size });
        } else {
          const errMsg = stderrBuf.trim() || `上传失败 (exit code ${code})`;
          onProgress?.({
            type: 'file-error',
            message: errMsg,
            localPath: localAbsPath,
          });
          reject(new Error(errMsg));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 批量上传，逐个文件上传并推送进度。
   */
  async uploadBatchWithProgress(
    files: { localAbsPath: string; remotePath: string }[],
    onProgress?: ProgressCallback,
  ): Promise<UploadBatchResult> {
    const uploaded: UploadResult[] = [];
    const failed: { localPath: string; error: string }[] = [];
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.({
        type: 'batch-progress',
        current: i,
        total,
        message: `正在上传 (${i + 1}/${total}): ${path.basename(file.localAbsPath)}`,
      });

      try {
        const result = await this.uploadFileWithProgress(
          file.localAbsPath,
          file.remotePath,
          onProgress,
        );
        uploaded.push(result);
      } catch (e) {
        failed.push({
          localPath: file.localAbsPath,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    onProgress?.({
      type: 'batch-progress',
      current: total,
      total,
      message: `全部完成: ${uploaded.length} 成功, ${failed.length} 失败`,
    });

    return { uploaded, failed };
  }
}
