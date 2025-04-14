import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AppLogger } from '../logger/logger.service'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	constructor(private readonly logger: AppLogger) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		const request = ctx.getRequest<Request>()

		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR

		const message =
			exception instanceof HttpException
				? exception.getResponse()
				: (exception as Error).message

		const stack = exception instanceof Error ? exception.stack : null

		this.logger.error(
			`[${request.method}] ${request.url} - ${status} - ${message}`,
			stack || ''
		)

		response.status(status).json({
			statusCode: status,
			success: false,
			message,
			timestamp: new Date().toISOString(),
			path: request.url,
		})
	}
}
