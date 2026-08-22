import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';
import { DongmanhiScraperService } from './dongmanhi/dongmanhi-scraper.service';
import { ManhuazhanScraperService } from './manhuazhan/manhuazhan-scraper.service';
import { NniaoomanScraperService } from './nniaooman/nniaooman-scraper.service';
import { Manhwa18ScraperService } from './manhwa18/manhwa18-scraper.service';
import { DongmanmanhuaScraperService } from './dongmanmanhua/dongmanmanhua-scraper.service';
import { AcgnScraperService } from './acgn/acgn-scraper.service';
import { AntbywScraperService } from './antbyw/antbyw-scraper.service';
import { JcomicScraperService } from './jcomic/jcomic-scraper.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceSource } from '../entities/resource-source.entity';
import { SourceSite } from '../entities/source-site.entity';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly webtoonsScraper: WebtoonsScraperService,
    private readonly dongmanhiScraper: DongmanhiScraperService,
    private readonly manhuazhanScraper: ManhuazhanScraperService,
    private readonly nniaoomanScraper: NniaoomanScraperService,
    private readonly manhwa18Scraper: Manhwa18ScraperService,
    private readonly dongmanmanhuaScraper: DongmanmanhuaScraperService,
    private readonly acgnScraper: AcgnScraperService,
    private readonly antbywScraper: AntbywScraperService,
    private readonly jcomicScraper: JcomicScraperService,
    @InjectRepository(ResourceSource)
    private readonly resourceSourceRepo: Repository<ResourceSource>,
    @InjectRepository(SourceSite)
    private readonly sourceSiteRepo: Repository<SourceSite>,
  ) {}

  // ===== 通用: 按 resourceId 自动路由到对应源站 =====
  @Post('scrape-resource')
  async scrapeByResource(
    @Body('resourceId') resourceId: number,
    @Body('maxChapters') maxChapters?: number,
    @Body('sourceSiteId') sourceSiteId?: number,
  ) {
    const sources = await this.resourceSourceRepo.find({
      where: sourceSiteId
        ? { resourceId, sourceSiteId }
        : { resourceId },
      relations: ['sourceSite'],
    });
    if (sources.length === 0) {
      throw new NotFoundException(`资源 ${resourceId} 没有关联的来源记录`);
    }

    // 一本书有多个源时,同时发起每个源的抓取任务(各源任务互不影响)
    const tasks: { sourceSiteId: number; domain: string; taskId: number }[] =
      [];
    for (const rs of sources) {
      const scraper = this.resolveScraperByDomain(rs.sourceSite?.domain);
      const result = await scraper.scrapeByResourceIdAsync(
        resourceId,
        maxChapters || 0,
      );
      tasks.push({
        sourceSiteId: rs.sourceSiteId,
        domain: rs.sourceSite?.domain || '',
        taskId: result.taskId,
      });
    }
    return { success: true, data: { tasks, sourceCount: sources.length } };
  }

  // ===== Webtoons =====
  @Post('webtoons/discover')
  async discoverWebtoons() {
    const result = await this.webtoonsScraper.discoverCatalog();
    return { success: true, data: result };
  }

  @Post('webtoons/scrape')
  async scrapeWebtoons(
    @Body('titleNo') titleNo: number,
    @Body('maxChapters') maxChapters?: number,
  ) {
    const result = await this.webtoonsScraper.scrapeOne(
      titleNo,
      maxChapters || 0,
    );
    return { success: true, data: result };
  }

  @Post('webtoons/scrape-resource')
  async scrapeWebtoonsByResource(
    @Body('resourceId') resourceId: number,
    @Body('maxChapters') maxChapters?: number,
  ) {
    const result = await this.webtoonsScraper.scrapeByResourceIdAsync(
      resourceId,
      maxChapters || 0,
    );
    return { success: true, data: result };
  }

  @Get('webtoons/scrape')
  async scrapeWebtoonsGet(
    @Query('titleNo') titleNo: string,
    @Query('maxChapters') maxChapters?: string,
  ) {
    const result = await this.webtoonsScraper.scrapeOne(
      parseInt(titleNo, 10),
      maxChapters ? parseInt(maxChapters, 10) : 0,
    );
    return { success: true, data: result };
  }

  // ===== 动漫嗨 (dongmanhi) =====
  @Post('dongmanhi/discover')
  async discoverDongmanhi() {
    const result = await this.dongmanhiScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 漫画栈 (manhuazhan/60ti) =====
  @Post('manhuazhan/discover')
  async discoverManhuazhan() {
    const result = await this.manhuazhanScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 鸟鸟韩漫 (nnhm7) =====
  @Post('nniaooman/discover')
  async discoverNniaooman() {
    const result = await this.nniaoomanScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== Manhwa18 (manhwa18.cc) =====
  @Post('manhwa18/discover')
  async discoverManhwa18() {
    const result = await this.manhwa18Scraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 咚漫中文 (dongmanmanhua.cn) =====
  @Post('dongmanmanhua/discover')
  async discoverDongmanmanhua() {
    const result = await this.dongmanmanhuaScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 動漫戲說 (comic.acgn.cc) =====
  @Post('acgn/discover')
  async discoverAcgn() {
    const result = await this.acgnScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 蚂蚁搬运网 (www.antbyw.com) =====
  @Post('antbyw/discover')
  async discoverAntbyw() {
    const result = await this.antbywScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== JComic (jcomic.net) =====
  @Post('jcomic/discover')
  async discoverJcomic() {
    const result = await this.jcomicScraper.discoverCatalog();
    return { success: true, data: result };
  }

  // ===== 路由解析 =====
  private resolveScraperByDomain(domain?: string) {
    if (domain === 'www.dongmanhi.com') {
      return this.dongmanhiScraper;
    }
    if (domain === 'www.60ti.com') {
      return this.manhuazhanScraper;
    }
    if (domain === 'nnhm7.com') {
      return this.nniaoomanScraper;
    }
    if (domain === 'manhwa18.cc') {
      return this.manhwa18Scraper;
    }
    if (domain === 'www.dongmanmanhua.cn') {
      return this.dongmanmanhuaScraper;
    }
    if (domain === 'comic.acgn.cc') {
      return this.acgnScraper;
    }
    if (domain === 'www.antbyw.com') {
      return this.antbywScraper;
    }
    if (domain === 'jcomic.net') {
      return this.jcomicScraper;
    }
    return this.webtoonsScraper;
  }
}
