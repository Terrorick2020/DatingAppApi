import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ClientsModule } from '@nestjs/microservices'
import { RedisModule } from '@/redis/redis.module'
import { PrismaModule } from '~/prisma/prisma.module'
import { AppLogger } from '@/common/logger/logger.service'

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
  ],
  providers: [AppLogger],
  exports: [
    PrismaModule,
    RedisModule,
    AppLogger,
    ConfigModule,
    ClientsModule,
  ],
})
export class MicroModule {}
