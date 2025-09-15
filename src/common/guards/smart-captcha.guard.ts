import { AppLogger } from '@/common/logger/logger.service'
import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import * as https from 'https'
import * as querystring from 'querystring'
import { SMART_CAPTCHA_KEY } from '../decorators/smart-captcha.decorator'

@Injectable()
export class SmartCaptchaGuard implements CanActivate {
	private readonly SMARTCAPTCHA_SERVER_KEY: string | undefined
	private readonly SMARTCAPTCHA_VALIDATE_URL = 'smartcaptcha.yandexcloud.net'
	private readonly SMARTCAPTCHA_VALIDATE_PATH = '/validate'

	constructor(
		private readonly configService: ConfigService,
		private readonly logger: AppLogger,
		private readonly reflector: Reflector
	) {
		this.SMARTCAPTCHA_SERVER_KEY = this.configService.get<string>(
			'smartCaptcha.serverKey'
		)

		if (!this.SMARTCAPTCHA_SERVER_KEY) {
			this.logger.warn(
				'SMARTCAPTCHA_SERVER_KEY не настроен в переменных окружения',
				'SmartCaptchaGuard'
			)
		}
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		// Проверяем, требуется ли SmartCaptcha для этого эндпоинта
		const requireSmartCaptcha = this.reflector.getAllAndOverride<boolean>(
			SMART_CAPTCHA_KEY,
			[context.getHandler(), context.getClass()]
		)

		// Если декоратор не применен, пропускаем проверку
		if (!requireSmartCaptcha) {
			return true
		}

		const request = context.switchToHttp().getRequest()
		const token = request.headers['x-captcha-token']
		const ip = this.getClientIp(request)

		this.logger.debug('SmartCaptcha проверка IP клиента', 'SmartCaptchaGuard', {
			ip,
			headers: {
				'x-real-ip': request.headers['x-real-ip'],
				'x-forwarded-for': request.headers['x-forwarded-for'],
				'cf-connecting-ip': request.headers['cf-connecting-ip'],
			},
		})

		// Если токен не передан, разрешаем доступ (для обратной совместимости)
		if (!token) {
			this.logger.warn(
				'Токен SmartCaptcha не передан в заголовке X-Captcha-Token',
				'SmartCaptchaGuard',
				{ ip }
			)
			return true
		}

		// Если секретный ключ не настроен, разрешаем доступ
		if (!this.SMARTCAPTCHA_SERVER_KEY) {
			this.logger.warn(
				'SMARTCAPTCHA_SERVER_KEY не настроен, пропускаем проверку',
				'SmartCaptchaGuard'
			)
			return true
		}

		try {
			const isValid = await this.validateCaptcha(token, ip)

			if (!isValid) {
				this.logger.warn(
					'SmartCaptcha проверка не пройдена - пользователь заблокирован как бот',
					'SmartCaptchaGuard',
					{ ip, token: token.substring(0, 10) + '...' }
				)

				throw new HttpException(
					{
						success: false,
						message: 'Пользователь заблокирован',
						error: 'CAPTCHA_FAILED',
					},
					HttpStatus.FORBIDDEN
				)
			}

			this.logger.debug(
				'SmartCaptcha проверка пройдена успешно',
				'SmartCaptchaGuard',
				{ ip }
			)

			return true
		} catch (error: any) {
			if (error instanceof HttpException) {
				throw error
			}

			this.logger.error(
				'Ошибка при проверке SmartCaptcha',
				error?.stack,
				'SmartCaptchaGuard',
				{ ip, token: token?.substring(0, 10) + '...', error }
			)

			// В случае ошибки API разрешаем доступ (fail-open)
			return true
		}
	}

	private async validateCaptcha(token: string, ip: string): Promise<boolean> {
		return new Promise(resolve => {
			const postData = querystring.stringify({
				secret: this.SMARTCAPTCHA_SERVER_KEY || '',
				token: token,
				ip: ip,
			})

			const options = {
				hostname: this.SMARTCAPTCHA_VALIDATE_URL,
				port: 443,
				path: this.SMARTCAPTCHA_VALIDATE_PATH,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Content-Length': Buffer.byteLength(postData),
				},
				timeout: 5000, 
			}

			const req = https.request(options, res => {
				let content = ''

				res.on('data', chunk => {
					content += chunk
				})

				res.on('end', () => {
					if (res.statusCode !== 200) {
						this.logger.error(
							`Ошибка API SmartCaptcha: код=${res.statusCode}, сообщение=${content}`,
							'SmartCaptchaGuard'
						)
						resolve(true) // Разрешаем доступ при ошибке API
						return
					}

					try {
						const parsedContent = JSON.parse(content)
						const isValid = parsedContent.status === 'ok'

						this.logger.debug(
							`SmartCaptcha ответ: ${JSON.stringify(parsedContent)}`,
							'SmartCaptchaGuard'
						)

						resolve(isValid)
					} catch (error: any) {
						this.logger.error(
							'Ошибка парсинга ответа SmartCaptcha',
							error?.stack,
							'SmartCaptchaGuard',
							{ content, error: error }
						)
						resolve(true) // Разрешаем доступ при ошибке парсинга
					}
				})
			})

			req.on('error', error => {
				this.logger.error(
					'Ошибка HTTP запроса к SmartCaptcha',
					error?.stack,
					'SmartCaptchaGuard',
					{ error }
				)
				resolve(true) // Разрешаем доступ при ошибке сети
			})

			req.on('timeout', () => {
				this.logger.warn(
					'Таймаут запроса к SmartCaptcha API',
					'SmartCaptchaGuard'
				)
				req.destroy()
				resolve(true) // Разрешаем доступ при таймауте
			})

			// Отправляем POST данные
			req.write(postData)
			req.end()
		})
	}

	private getClientIp(request: any): string {
		return (
			request.headers['cf-connecting-ip'] ||
			request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
			request.headers['x-real-ip'] ||
			request.connection?.remoteAddress ||
			request.socket?.remoteAddress ||
			request.ip ||
			'127.0.0.1'
		)
	}
}
