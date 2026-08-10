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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceSource } from '../entities/resource-source.entity';
import { SourceSite } from '../entities/source-site.entity';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly webtoonsScraper: WebtoonsScraperService,
    private readonly dongmanhiScraper: DongmanhiScraperService,
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
  ) {
    const scraper = await this.resolveScraperByResourceId(resourceId);
    const result = await scraper.scrapeByResourceIdAsync(
      resourceId,
      maxChapters || 0,
    );
    return { success: true, data: result };
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

  // ===== 路由解析 =====
  private async resolveScraperByResourceId(resourceId: number) {
    const rs = await this.resourceSourceRepo.findOne({
      where: { resourceId },
      relations: ['sourceSite'],
    });
    if (!rs) {
      throw new NotFoundException(`资源 ${resourceId} 没有关联的来源记录`);
    }
    const domain = rs.sourceSite?.domain;
    if (domain === 'www.dongmanhi.com') {
      return this.dongmanhiScraper;
    }
    return this.webtoonsScraper;
  }
}
