import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { PrismaService } from '../../../prisma/prisma.service'
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorator'

@Injectable()
export class AdminOnlyGuard implements CanActivate {
	constructor(
		private readonly prisma: PrismaService,
		private readonly reflector: Reflector
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isAdminOnly = this.reflector.getAllAndOverride<boolean>(
			ADMIN_ONLY_KEY,
			[context.getHandler(), context.getClass()]
		)
		if (!isAdminOnly) return true

		const request = context.switchToHttp().getRequest<Request>()
		// Ищем telegramId админа в заголовках или query параметрах
		const adminTelegramId =
			request.headers['x-spectre-telegram-id'] ||
			request.headers['x-admin-telegram-id'] ||
			request.query?.adminTelegramId ||
			request.body?.adminTelegramId

		console.log('🔍 AdminOnlyGuard: Получен adminTelegramId:', adminTelegramId)
		console.log('🔍 AdminOnlyGuard: Все заголовки:', request.headers)

		if (!adminTelegramId || adminTelegramId === 'error')
			throw new ForbiddenException('Неизвестный администратор')

		const user = await this.prisma.user.findUnique({
			where: { telegramId: adminTelegramId },
			select: { role: true },
		})

		console.log('🔍 AdminOnlyGuard: Найден пользователь:', user)

		if (user?.role !== 'Admin') {
			console.log(
				'🔍 AdminOnlyGuard: Пользователь не является админом, роль:',
				user?.role
			)
			throw new ForbiddenException('Доступ только для администраторов')
		}

		console.log('🔍 AdminOnlyGuard: Авторизация успешна')

		return true
	}
}
