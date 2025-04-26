import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { AbstractMicroService } from '@/common/abstract/micro/micro.service'


@Injectable()
export class ChatsMicroserviceService extends AbstractMicroService {
    constructor(
        prismaService: PrismaService,
        redisService: RedisService,
        configService: ConfigService,
    ) {
        super(prismaService, redisService, configService)
    }

    
}
