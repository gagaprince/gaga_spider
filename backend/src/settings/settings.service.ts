import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export interface AppSettings {
  resourcePath: string;
  baiduNetdiskEnabled: boolean;
  baiduNetdiskPath: string;
}

const CONFIG_FILE = join(process.cwd(), 'settings.local.json');
const DEFAULT_SETTINGS: AppSettings = {
  resourcePath: resolve(process.cwd(), '..', 'resourceFiles'),
  baiduNetdiskEnabled: false,
  baiduNetdiskPath: '/收藏家/漫画',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private settings: AppSettings;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = readFileSync(CONFIG_FILE, 'utf-8');
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } else {
        this.settings = { ...DEFAULT_SETTINGS };
        this.save();
      }
    } catch (e) {
      this.logger.warn(`加载配置失败,使用默认值: ${e}`);
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this.ensureDir(this.settings.resourcePath);
  }

  private save() {
    writeFileSync(CONFIG_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  private ensureDir(dir: string) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      this.logger.log(`创建资源目录: ${dir}`);
    }
  }

  getAll(): AppSettings {
    return { ...this.settings };
  }

  get resourcePath(): string {
    return this.settings.resourcePath;
  }

  get baiduNetdiskEnabled(): boolean {
    return this.settings.baiduNetdiskEnabled;
  }

  get baiduNetdiskPath(): string {
    return this.settings.baiduNetdiskPath;
  }

  update(partial: Partial<AppSettings>): AppSettings {
    if (partial.resourcePath !== undefined) {
      this.settings.resourcePath = resolve(partial.resourcePath);
      this.ensureDir(this.settings.resourcePath);
    }
    if (partial.baiduNetdiskEnabled !== undefined) {
      this.settings.baiduNetdiskEnabled = partial.baiduNetdiskEnabled;
    }
    if (partial.baiduNetdiskPath !== undefined) {
      this.settings.baiduNetdiskPath = partial.baiduNetdiskPath;
    }
    this.save();
    return { ...this.settings };
  }
}
