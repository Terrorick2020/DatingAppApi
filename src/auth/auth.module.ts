import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserService } from '../user/user.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'

@Module({
	controllers: [AuthController],
	providers: [
		AuthService,
		PrismaService,
		UserService,
		StorageService,
		AppLogger,
	],
})
export class AuthModule {}
