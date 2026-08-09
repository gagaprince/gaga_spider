import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { WebtoonsScraperService } from './webtoons/webtoons-scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: WebtoonsScraperService) {}

  @Post('webtoons/discover')
  async discover() {
    const result = await this.scraperService.discoverCatalog();
    return { success: true, data: result };
  }

  @Post('webtoons/scrape')
  async scrapeOne(
    @Body('titleNo') titleNo: number,
    @Body('maxChapters') maxChapters?: number,
  ) {
    const result = await this.scraperService.scrapeOne(titleNo, maxChapters || 0);
    return { success: true, data: result };
  }

  @Post('webtoons/scrape-resource')
  async scrapeByResource(
    @Body('resourceId') resourceId: number,
    @Body('maxChapters') maxChapters?: number,
  ) {
    const result = await this.scraperService.scrapeByResourceIdAsync(
      resourceId,
      maxChapters || 0,
    );
    return { success: true, data: result };
  }

  @Get('webtoons/scrape')
  async scrapeOneGet(
    @Query('titleNo') titleNo: string,
    @Query('maxChapters') maxChapters?: string,
  ) {
    const result = await this.scraperService.scrapeOne(
      parseInt(titleNo, 10),
      maxChapters ? parseInt(maxChapters, 10) : 0,
    );
    return { success: true, data: result };
  }
}
