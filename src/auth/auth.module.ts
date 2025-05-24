import { Module, ValidationPipe } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserService } from '../user/user.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { APP_PIPE } from '@nestjs/core'
import { GeoService } from '../geo/geo.service'

@Module({
	controllers: [AuthController],
	providers: [
		AuthService,
		PrismaService,
		UserService,
		StorageService,
		AppLogger,
		GeoService,
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
