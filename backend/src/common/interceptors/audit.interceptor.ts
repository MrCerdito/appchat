import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable, tap } from 'rxjs';

const AUDIT_ACTIONS = new Set([
  'auth.login',
  'auth.login_failed',
  'auth.register',
  'session.create',
  'session.close',
  'session.transfer',
  'session.takeover',
  'session.assign',
]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const action = req?.auditAction as string | undefined;
    if (!action || !AUDIT_ACTIONS.has(action)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.dataSource
          .createQueryBuilder()
          .insert()
          .into('audit_logs')
          .values({
            userId: req.user?.id ?? null,
            action,
            entity: req.auditEntity ?? null,
            entityId: req.auditEntityId ?? null,
            ip: req.ip ?? null,
            userAgent: req.headers?.['user-agent']?.slice(0, 500) ?? null,
            detail: req.auditDetail ?? null,
          })
          .execute()
          .catch(() => {});
      }),
    );
  }
}
