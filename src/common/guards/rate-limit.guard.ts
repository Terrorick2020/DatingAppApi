import {
	Injectable,
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
} from '@nestjs/common'
import { RedisService } from '@/redis/redis.service'
import { AppLogger } from '@/common/logger/logger.service'

@Injectable()
export class RegistrationRateLimitGuard implements CanActivate {
	private readonly MAX_ATTEMPTS = 5 // Максимальное количество попыток
	private readonly TIME_WINDOW = 3600 // Окно времени в секундах (1 час)

	constructor(
		private readonly redisService: RedisService,
		private readonly logger: AppLogger
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const ip = request.ip || request.connection.remoteAddress

		const key = `registration_limit:${ip}`

		// Получаем текущее количество попыток
		const attemptsResponse = await this.redisService.getKey(key)
		let attempts = 1

		if (attemptsResponse.success && attemptsResponse.data) {
			attempts = parseInt(attemptsResponse.data) + 1
		}

		// Обновляем счетчик попыток
		await this.redisService.setKey(key, attempts.toString(), this.TIME_WINDOW)

		// Проверяем лимит
		if (attempts > this.MAX_ATTEMPTS) {
			this.logger.warn(
				`Превышен лимит попыток регистрации для IP: ${ip}`,
				'RegistrationRateLimitGuard',
				{ ip, attempts }
			)

			throw new HttpException(
				'Превышен лимит попыток регистрации. Пожалуйста, попробуйте позже.',
				HttpStatus.TOO_MANY_REQUESTS
			)
		}

		return true
	}
}
