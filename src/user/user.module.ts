import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { StorageService } from '../storage/storage.service'
import { RedisModule } from '@nestjs-modules/ioredis'
import { AppLogger } from '../common/logger/logger.service'

@Module({
	imports: [RedisModule],
	controllers: [UserController],
	providers: [UserService, PrismaService, StorageService, AppLogger],
	exports: [UserService],
})
export class UserModule {}
