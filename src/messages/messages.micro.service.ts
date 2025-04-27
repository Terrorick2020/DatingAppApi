import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'

@Injectable()
export class MessagesMicroService extends MicroService {
    constructor(
        protected readonly appLoger: AppLogger,
        protected readonly prismaService: PrismaService,
        protected readonly redisService: RedisService,
        protected readonly configService: ConfigService,
    ) {
        super(appLoger, configService, prismaService, redisService)
    }
}
