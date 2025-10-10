import {
	HttpException,
	HttpStatus,
	Injectable,
	NestMiddleware,
} from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { AppLogger } from '../logger/logger.service'
import { SmartCaptchaService } from '../services/smart-captcha.service'

@Injectable()
export class SmartCaptchaMiddleware implements NestMiddleware {
	private readonly CONTEXT = 'SmartCaptchaMiddleware'

	constructor(
		private readonly smartCaptchaService: SmartCaptchaService,
		private readonly logger: AppLogger
	) {}

	async use(req: Request, res: Response, next: NextFunction) {
		try {
			// Исключаем определенные пути из проверки
			const excludedPaths = [
				// Psychologists (проверяем как полный путь, так и обрезанный)
				'/psychologists/generate-invite-link',
				'/psychologists/check-invite-link',
				'/psychologists/available',
				'/generate-invite-link',
				'/check-invite-link',
				'/available',
				// Auth
				'/auth/login',
				'/auth/check',
				'/auth/refresh',
				// User
				'/user/me',
				'/user/profile',
				'/user/photo',
				'/user/delete-photo',
				'/user/block',
				'/user/unblock',
				'/user/report',
				'/user/like',
				'/user/dislike',
				'/user/superlike',
				'/user/matches',
				'/user/nearby',
				'/user/search',
				'/user/online',
				'/user/offline',
			]

			if (excludedPaths.includes(req.path)) {
				this.logger.debug(
					`Запрос ${req.method} ${req.path} в списке исключений - пропускаем`,
					this.CONTEXT
				)
				return next()
			}

			// Проверяем наличие заголовка X-Captcha-Token
			const captchaToken = req.headers['x-captcha-token'] as string

			if (!captchaToken) {
				this.logger.debug(
					`Запрос ${req.method} ${req.path} без заголовка X-Captcha-Token - пропускаем`,
					this.CONTEXT
				)
				return next()
			}

			this.logger.debug(
				`Обнаружен заголовок X-Captcha-Token в запросе ${req.method} ${req.path}`,
				this.CONTEXT
			)

			// Получаем IP адрес пользователя
			const userIp = this.getClientIp(req)

			// Валидируем токен
			const validationResult = await this.smartCaptchaService.validateToken(
				captchaToken,
				userIp
			)

			if (!validationResult.success) {
				this.logger.warn(
					`Captcha валидация не пройдена для IP ${userIp}: ${validationResult.message}`,
					this.CONTEXT
				)

				// Возвращаем ошибку с уникальным статус-кодом
				throw new HttpException(
					{
						success: false,
						message:
							'Мы подозреваем, что вы робот. Пожалуйста, пройдите проверку еще раз.',
						error: 'CAPTCHA_VALIDATION_FAILED',
						details: validationResult.message,
					},
					HttpStatus.FORBIDDEN
				)
			}

			this.logger.debug(
				`Captcha валидация успешно пройдена для IP ${userIp}`,
				this.CONTEXT
			)

			// Добавляем информацию о валидации в запрос для возможного использования
			;(req as any).captchaValidated = true
			;(req as any).captchaHost = validationResult.host

			next()
		} catch (error: any) {
			if (error instanceof HttpException) {
				throw error
			}

			this.logger.error(
				`Ошибка в SmartCaptchaMiddleware: ${error?.message || 'Unknown error'}`,
				error?.stack,
				this.CONTEXT
			)

			// При внутренних ошибках middleware пропускаем запрос
			next()
		}
	}

	/**
	 * Получение IP адреса клиента с учетом прокси
	 */
	private getClientIp(req: Request): string {
		const forwarded = req.headers['x-forwarded-for'] as string
		const realIp = req.headers['x-real-ip'] as string
		const remoteAddress = req.connection?.remoteAddress

		if (forwarded) {
			// X-Forwarded-For может содержать несколько IP через запятую
			return forwarded.split(',')[0].trim()
		}

		if (realIp) {
			return realIp
		}

		if (remoteAddress) {
			// Убираем IPv6 префикс если есть
			return remoteAddress.replace(/^::ffff:/, '')
		}

		return '127.0.0.1'
	}
}
