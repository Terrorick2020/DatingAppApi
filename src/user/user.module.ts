import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { StorageService } from '../storage/storage.service'

@Module({
	controllers: [UserController],
	providers: [UserService, PrismaService, StorageService],
	exports: [UserService],
})
export class UserModule {}
