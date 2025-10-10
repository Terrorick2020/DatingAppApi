import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppLogger } from '../logger/logger.service'

interface CaptchaValidationResponse {
	status: 'ok' | 'failed'
	message: string
	host?: string
}

@Injectable()
export class SmartCaptchaService {
	private readonly CONTEXT = 'SmartCaptchaService'
	private readonly serverKey: string

	constructor(
		private readonly configService: ConfigService,
		private readonly logger: AppLogger
	) {
		// Получаем ключ напрямую из переменных окружения
		this.serverKey = process.env.SMARTCAPTCHA_SERVER_KEY || ''

		if (!this.serverKey) {
			this.logger.warn(
				'SMARTCAPTCHA_SERVER_KEY не найден в переменных окружения',
				this.CONTEXT
			)
		} else {
			this.logger.debug(
				'SMARTCAPTCHA_SERVER_KEY успешно загружен',
				this.CONTEXT
			)
		}
	}

	/**
	 * Валидация токена Smart Captcha
	 */
	async validateToken(
		token: string,
		userIp: string
	): Promise<{
		success: boolean
		message?: string
		host?: string
	}> {
		try {
			if (!this.serverKey) {
				this.logger.error('SMARTCAPTCHA_SERVER_KEY не настроен', this.CONTEXT)
				return {
					success: false,
					message: 'Captcha не настроена',
				}
			}

			if (!token) {
				this.logger.warn('Попытка валидации без токена', this.CONTEXT)
				return {
					success: false,
					message: 'Токен не предоставлен',
				}
			}

			this.logger.debug(
				`Валидация токена Smart Captcha для IP: ${userIp}`,
				this.CONTEXT
			)

			// Формируем данные для запроса
			const formData = new URLSearchParams({
				secret: this.serverKey,
				token: token,
				ip: userIp,
			})

			// Отправляем запрос к Yandex Smart Captcha
			const response = await fetch(
				'https://smartcaptcha.yandexcloud.net/validate',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: formData.toString(),
				}
			)

			// Обрабатываем HTTP ошибки как успешную валидацию
			if (!response.ok) {
				this.logger.warn(
					`HTTP ошибка при валидации captcha: ${response.status}`,
					this.CONTEXT
				)
				return {
					success: true,
					message: 'Captcha валидация пропущена из-за ошибки сервиса',
				}
			}

			const result: CaptchaValidationResponse = await response.json()

			this.logger.debug(
				`Результат валидации captcha: ${JSON.stringify(result)}`,
				this.CONTEXT
			)

			if (result.status === 'ok') {
				return {
					success: true,
					message: result.message,
					host: result.host,
				}
			} else {
				this.logger.warn(
					`Captcha валидация не пройдена: ${result.message}`,
					this.CONTEXT
				)
				return {
					success: false,
					message: result.message || 'Проверка не пройдена',
				}
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при валидации Smart Captcha: ${error.message}`,
				error.stack,
				this.CONTEXT
			)

			// При ошибках сети считаем валидацию успешной
			return {
				success: true,
				message: 'Captcha валидация пропущена из-за ошибки сети',
			}
		}
	}
}
