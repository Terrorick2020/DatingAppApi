import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { PrismaService } from '../../../prisma/prisma.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class UserStatusGuard implements CanActivate {
	constructor(
		private readonly prisma: PrismaService,
		private readonly reflector: Reflector
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		])
		if (isPublic) return true

		const req: Request = context.switchToHttp().getRequest()
		const telegramId = this.extractTelegramId(req)
		if (!telegramId) return true

		const user = await this.prisma.user.findUnique({
			where: { telegramId },
			select: { id: true, status: true },
		})

		if (user?.status === 'Blocked') {
			throw new ForbiddenException('Пользователь заблокирован')
		}

		return true
	}

	private extractTelegramId(req: Request): string | undefined {
		return (
			(req.headers['x-telegram-id'] as string) ||
			(req.query.telegramId as string) ||
			req.body?.telegramId
		)
	}
}
