import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getRequestTracker(context: ExecutionContext): string {
    const req = context.switchToHttp().getRequest();
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}
