import { Injectable } from '@nestjs/common';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { successResponse } from '../common/helpers/api.response.helper';
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service';
import { StorageService } from '../storage/storage.service';
import { RedisService } from '../redis/redis.service';
import { AppLogger } from '../common/logger/logger.service';
import { PrismaService } from '~/prisma/prisma.service';

@Injectable()
export class AdminService {
  private readonly CONTEXT = 'AdminService'
  
    constructor(
      private readonly prisma: PrismaService,
      private readonly logger: AppLogger,
      private readonly redisService: RedisService,
      private readonly storageService: StorageService,
      private readonly redisPubSubService: RedisPubSubService
    ) {}
  
  async blockUser(telegramId: string) {
	await this.prisma.user.update({
		where: { telegramId },
		data: { status: 'Blocked' },
	})
	return successResponse(null, 'Пользователь заблокирован')
  }

  async unblockUser(telegramId: string) {
    await this.prisma.user.update({
      where: { telegramId },
      data: { status: 'Noob' },
    })
    return successResponse(null, 'Пользователь разблокирован')
  }

  async activatePremium(telegramId: string) {
	await this.prisma.user.update({
		where: { telegramId },
		data: { status: 'Pro' },
	})
	return successResponse(null, 'Премиум активирован')
}
}
