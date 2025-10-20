import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { UserStatusService } from '../../user/user-status.service'

@Injectable()
export class UserActivityMiddleware implements NestMiddleware {
	constructor(private readonly userStatusService: UserStatusService) {}

	async use(req: Request, res: Response, next: NextFunction) {
		const telegramId =
			(req.headers['x-telegram-id'] as string) ||
			(req.query.telegramId as string) ||
			req.body?.telegramId

		if (telegramId) {
			try {
				await this.userStatusService.updateUserActivity(telegramId)
			} catch (error) {
				console.error('Ошибка при обновлении активности пользователя:', error)
			}
		}

		next()
	}
}
