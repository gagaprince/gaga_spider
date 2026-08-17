import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll() {
    return this.settingsService.getAll();
  }

  @Put()
  update(
    @Body()
    body: {
      resourcePath?: string;
      baiduNetdiskEnabled?: boolean;
      baiduNetdiskPath?: string;
    },
  ) {
    return this.settingsService.update(body);
  }
}
