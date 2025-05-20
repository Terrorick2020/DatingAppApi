import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '~/prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';
import { ComplaintMicroController } from './complaint.micro.controller';
import { AppLogger } from '../common/logger/logger.service';
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RedisPubSubModule,
    ConfigModule,
  ],
  controllers: [ComplaintController, ComplaintMicroController],
  providers: [ComplaintService, AppLogger],
  exports: [ComplaintService],
})
export class ComplaintModule {}