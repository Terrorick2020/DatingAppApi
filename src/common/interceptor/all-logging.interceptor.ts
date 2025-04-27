import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
} from '@nestjs/common'
import { Observable, tap, catchError } from 'rxjs'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	constructor(private readonly logger: AppLogger) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const req = context.switchToHttp().getRequest()
		const { method, originalUrl: url, ip, body } = req
		const now = Date.now()

		// Логируем входящий запрос
		this.logger.logHttpRequest(method, url, ip, body, undefined, undefined)

		return next.handle().pipe(
			tap(response => {
				const duration = Date.now() - now
				const statusCode = context.switchToHttp().getResponse().statusCode

				// Логируем HTTP ответ
				this.logger.logHttpRequest(method, url, ip, null, statusCode, duration)

				// Дополнительно логируем API response, если он содержит success флаг
				if (response && typeof response === 'object' && 'success' in response) {
					this.logger.logApiResponse(method, url, response, duration)
				}
			}),
			catchError(error => {
				const duration = Date.now() - now
				const statusCode = error.status || 500

				// Логируем ошибку HTTP
				this.logger.logHttpRequest(method, url, ip, null, statusCode, duration)

				// Более детальное логирование ошибки
				this.logger.error(
					`Ошибка при обработке ${method} ${url}`,
					error.stack,
					'HTTP Interceptor',
					{
						statusCode,
						errorName: error.name,
						errorMessage: error.message,
						body,
					}
				)

				// Перебрасываем ошибку дальше для обработки в ExceptionFilter
				throw error
			})
		)
	}
}
