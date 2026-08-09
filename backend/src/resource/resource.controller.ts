import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ResourceService } from './resource.service';

@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('scrapeStatus') scrapeStatus?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resourceService.findAll({
      type,
      keyword,
      scrapeStatus,
      category,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('categories/list')
  async listCategories() {
    return this.resourceService.listCategories();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.resourceService.findOne(id);
  }
}
