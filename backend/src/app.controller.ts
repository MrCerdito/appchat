import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/public.decorator';
import { AppService } from './app.service';

// Controller 100% publico (raiz + health de uptime/Docker).
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
