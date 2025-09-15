import { Module, ValidationPipe } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { PrismaService } from '../../prisma/prisma.service'
import { SmartCaptchaGuard } from '../common/guards/smart-captcha.guard'
import { AppLogger } from '../common/logger/logger.service'
import { GeoService } from '../geo/geo.service'
import { StorageService } from '../storage/storage.service'
import { UserService } from '../user/user.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
	controllers: [AuthController],
	providers: [
		AuthService,
		PrismaService,
		UserService,
		StorageService,
		AppLogger,
		GeoService,
		SmartCaptchaGuard,
		{
			provide: APP_PIPE,
			useFactory: () =>
				new ValidationPipe({
					transform: true,
					whitelist: true,
				}),
		},
		{
			provide: 'APP_INIT',
			useFactory: (prisma: PrismaService) => {
				// Делаем Prisma доступным для кастомных валидаторов
				;(global as any).prismaInstance = prisma
				return { initialized: true }
			},
			inject: [PrismaService],
		},
	],
})
export class AuthModule {}
