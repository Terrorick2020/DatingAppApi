import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
	Inject,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AppLogger } from '../logger/logger.service'
import {
	PrismaClientKnownRequestError,
	PrismaClientValidationError,
} from '@prisma/client/runtime/library'

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

		const errorResponse = this.createErrorResponse(exception, request)

		// Логирование с учетом типа ошибки
		const { message, error } = errorResponse

		this.logger.error(
			`Exception: ${message}`,
			error?.stack || (exception as any)?.stack,
			'ExceptionFilter',
			{
				path: request.url,
				method: request.method,
				body: request.body,
				statusCode: status,
				error,
			}
		)

		response.status(status).json(errorResponse)
	}

	private createErrorResponse(exception: unknown, request: Request) {
		// Базовый ответ
		const errorResponse = {
			success: false,
			message: 'Внутренняя ошибка сервера',
			timestamp: new Date().toISOString(),
			path: request.url,
			error: null as any,
		}

		// Обработка различных типов ошибок
		if (exception instanceof HttpException) {
			// NestJS HttpException
			const response = exception.getResponse()
			if (typeof response === 'object') {
				const responseObj = response as Record<string, any>
				errorResponse.message = responseObj.message || exception.message
				errorResponse.error = {
					name: exception.name,
					...responseObj,
				}
			} else {
				errorResponse.message = exception.message
				errorResponse.error = { name: exception.name }
			}
		} else if (exception instanceof PrismaClientKnownRequestError) {
			// Prisma ошибки запросов
			errorResponse.message = 'Ошибка при работе с базой данных'
			errorResponse.error = {
				name: exception.name,
				code: exception.code,
				meta: exception.meta,
				message: exception.message,
			}
		} else if (exception instanceof PrismaClientValidationError) {
			// Prisma ошибки валидации
			errorResponse.message = 'Ошибка валидации данных'
			errorResponse.error = {
				name: exception.name,
				message: exception.message,
			}
		} else if (exception instanceof Error) {
			// Стандартные ошибки JavaScript
			errorResponse.message = exception.message
			errorResponse.error = {
				name: exception.name,
				stack: exception.stack,
			}
		} else {
			// Неизвестные ошибки
			errorResponse.error = {
				unknown: String(exception),
			}
		}

		return errorResponse
	}
}
