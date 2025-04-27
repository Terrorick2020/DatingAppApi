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
		if (!telegramId || telegramId === undefined)
			throw new ForbiddenException('Пользователь не вошел в систему')
		const user = await this.prisma.user.findUnique({
			where: { telegramId },
			select: { status: true },
		})
		if (user?.status === 'Blocked') {
			throw new ForbiddenException('Пользователь заблокирован')
		}

		// if (!user) throw new ForbiddenException('Пользователь не найден')

		return true
	}

	private extractTelegramId(req: Request): string | undefined {
		const source =
			req.body?.telegramId ||
			req.params?.telegramId ||
			req.query?.telegramId ||
			req.headers['x-spectre-telegram-id']
		if (typeof source === 'string' || typeof source === 'number') {
			return String(source)
		}
	}
}
