import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../../../prisma/prisma.service'
import { Request } from 'express'
import { GEO_ENABLED_KEY } from '../decorators/geo-enabled.decorartors'

@Injectable()
export class GeoEnabledGuard implements CanActivate {
	constructor(
		private readonly prisma: PrismaService,
		private readonly reflector: Reflector
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isGeoRequired = this.reflector.getAllAndOverride<boolean>(
			GEO_ENABLED_KEY,
			[context.getHandler(), context.getClass()]
		)
		if (!isGeoRequired) return true

		const request = context.switchToHttp().getRequest<Request>()
		const telegramId =
			request.body?.telegramId ||
			request.params?.telegramId ||
			request.query?.telegramId
		console.log(telegramId)
		if (!telegramId || Array.isArray(telegramId)) {
			throw new ForbiddenException('telegramId обязателен')
		}

		const user = await this.prisma.user.findUnique({
			where: { telegramId },
			select: { geo: true },
		})

		if (!user?.geo) {
			throw new ForbiddenException('Геолокация отключена пользователем')
		}

		return true
	}
}
