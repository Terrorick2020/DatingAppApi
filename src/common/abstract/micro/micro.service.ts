import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices'
import { ConnectionDto } from './dto/connection.dto'
import { ConfigService } from '@nestjs/config'
import { AppLogger } from '@/common/logger/logger.service'
import type { PrismaService } from '~/prisma/prisma.service'
import type { RedisService } from '@/redis/redis.service'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import {
    ConnectionStatus,
    TcpPattern,
    type ResTcpConnection,
} from './micro.type'

export abstract class MicroService {
    private clientProxy: ClientProxy
    protected readonly ResErrData: ResTcpConnection
    protected readonly appLoger: AppLogger
    protected readonly prismaService: PrismaService
    protected readonly redisService: RedisService
    protected readonly configService: ConfigService

    constructor(
        appLoger: AppLogger,
        configService: ConfigService,
        prismaService: PrismaService,
        redisService: RedisService,
    ) {
        this.appLoger = appLoger
        this.configService = configService

        const host = configService.get<string>('WS_HOST', 'localhost')
        const port: number = Number(configService.get<string>('WS_PORT', ''))

        this.clientProxy = ClientProxyFactory.create({
            transport: Transport.TCP,
            options: {
                host: host,
                port: !isNaN(port) ? port : 6666,
            },
        })

        this.prismaService = prismaService
        this.redisService = redisService

        this.ResErrData = {
            roomName: null,
            telegramId: null,
            message: 'Возникла ошибка при выполнении действия',
            status: ConnectionStatus.Error,
        }
    }

    protected async sendRequest<TPattern, TRequest>(
        pattern: TPattern,
        data: TRequest,
        logCtx: string,
    ): Promise<void> {
        const trace = 'MicroService: protected async sendRequest<TPattern, TRequest>'

        try {
            await this.clientProxy.send<TRequest>(pattern, data),

            this.appLoger.log('Успешная отпрака сообщения на ws', logCtx)
        } catch (error) {
            this.appLoger.error('Ошибка отправка сообщения на ws', trace, logCtx, error)
        }
    }

    async joinRoom(connectionDto: ConnectionDto): Promise<void> {
        const result = await this.redisService.roomValidation(connectionDto)
        result.success && this.sendRequest<TcpPattern, ApiResponse<ResTcpConnection>>(
            TcpPattern.JoinRoom,
            result,
            `Подключение пользователя: ${connectionDto.telegramId} к комнате: ${connectionDto.roomName}`
        )
    }

    async leaveRoom (connectionDto: ConnectionDto): Promise<void> {
        const result = await this.redisService.roomValidation(connectionDto)
        result.success && this.sendRequest<TcpPattern, ApiResponse<ResTcpConnection>>(
            TcpPattern.LeaveRoom,
            result,
            `Отключения пользователя: ${connectionDto.telegramId} от комнаты: ${connectionDto.roomName}`
        )
    }
}
