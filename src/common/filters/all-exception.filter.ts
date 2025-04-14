import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { errorResponse } from '../helpers/api.response.helper'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	catch(exception: any, host: ArgumentsHost) {
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
				: exception.message || 'Internal server error'

		let errorMessage: any

		if (typeof message === 'string') {
			errorMessage = message
		} else if (message && typeof message === 'object' && message.message) {
			errorMessage = message.message
		} else {
			errorMessage = message
		}

		response
			.status(status)
			.json(
				errorResponse(
					typeof errorMessage === 'string' ? errorMessage : 'Ошибка запроса',
					errorMessage
				)
			)
	}
}
