import {
	CanActivate,
	ExecutionContext,
	Injectable,
	ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../../../prisma/prisma.service'
import { Request } from 'express'
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorators'

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
		const telegramId =
			request.body?.telegramId ||
			request.params?.telegramId ||
			request.query?.telegramId

		if (!telegramId) throw new ForbiddenException('Неизвестный пользователь')

		const user = await this.prisma.user.findUnique({
			where: { telegramId },
			select: { role: true },
		})

		if (user?.role !== 'Admin') {
			throw new ForbiddenException('Доступ только для администраторов')
		}

		return true
	}
}
