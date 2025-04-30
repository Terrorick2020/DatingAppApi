import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'
import { MatchMicroDto } from './dto/match-like.micro.dto'
import { SendMatchTcpPatterns } from './like.types'

@Injectable()
export class LikeMicroService extends MicroService {
    constructor(
        protected readonly appLoger: AppLogger,
        protected readonly prismaService: PrismaService,
        protected readonly redisService: RedisService,
        protected readonly configService: ConfigService,
    ) {
        super(appLoger, configService, prismaService, redisService)
    }

    async sendMatchTrigger(matchMicroDto: MatchMicroDto): Promise<void> {
        this.sendRequest<SendMatchTcpPatterns, MatchMicroDto>(
            SendMatchTcpPatterns.Trigger,
            matchMicroDto,
            `Мэтч от пользователя: ${matchMicroDto.fromUser.telegramId} к пользователю: ${matchMicroDto.telegramId}`
        )
    }
}
