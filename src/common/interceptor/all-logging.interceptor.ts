import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
	Inject,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	constructor(private readonly logger: AppLogger) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const req = context.switchToHttp().getRequest()
		const { method, originalUrl: url, ip, body } = req
		const now = Date.now()

		this.logger.log(
			`📥 ${method} ${url} - IP: ${ip} - Body: ${JSON.stringify(body)}`
		)

		return next.handle().pipe(
			tap(() => {
				const duration = Date.now() - now
				this.logger.log(`📤 ${method} ${url} - ✅ 200 - ${duration}ms`)
			})
		)
	}
}
