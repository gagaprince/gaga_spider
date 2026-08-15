import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';
import { DongmanhiScraperService } from './dongmanhi/dongmanhi-scraper.service';
import { ManhuazhanScraperService } from './manhuazhan/manhuazhan-scraper.service';
import { NniaoomanScraperService } from './nniaooman/nniaooman-scraper.service';

/**
 * 后端启动时确保所有已注册 scraper 的源站记录存在于 source_sites 表。
 * 这样前端的源站下拉框(书架筛选 / 目录抓取)无需先手动触发一次抓取就能列出全部源站。
 */
@Injectable()
export class ScraperInitializer implements OnModuleInit {
  private readonly logger = new Logger(ScraperInitializer.name);

  constructor(
    private readonly webtoons: WebtoonsScraperService,
    private readonly dongmanhi: DongmanhiScraperService,
    private readonly manhuazhan: ManhuazhanScraperService,
    private readonly nniaooman: NniaoomanScraperService,
  ) {}

  async onModuleInit(): Promise<void> {
    const scrapers = [
      { name: 'Webtoons', instance: this.webtoons },
      { name: '动漫嗨', instance: this.dongmanhi },
      { name: '漫画栈', instance: this.manhuazhan },
      { name: '鸟鸟韩漫', instance: this.nniaooman },
    ];

    for (const { name, instance } of scrapers) {
      try {
        const site = await instance.ensureSourceSite();
        this.logger.log(`源站已就绪: ${name} (${site.domain}, ${site.ageRating})`);
      } catch (e) {
        this.logger.warn(`源站 ${name} 初始化失败: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
