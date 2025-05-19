import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { MessagesController } from './messages.controller'
import { MessagesMicroController } from './messages.micro.controller'
import { MessegesService } from './messages.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RedisPubSubModule,
    ConfigModule,
  ],
  controllers: [MessagesController, MessagesMicroController],
  providers: [MessegesService, AppLogger, StorageService],
  exports: [MessegesService],
})
export class MessagesModule {}