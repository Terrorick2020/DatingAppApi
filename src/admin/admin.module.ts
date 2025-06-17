import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaService } from '~/prisma/prisma.service';
import { AppLogger } from '../common/logger/logger.service';
import { StorageService } from '../storage/storage.service';
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  controllers: [AdminController],
  providers: [AdminService, PrismaService, AppLogger, StorageService],
  imports: [RedisPubSubModule, RedisModule]
})
export class AdminModule {}
