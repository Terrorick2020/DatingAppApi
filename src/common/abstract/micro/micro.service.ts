import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { ConnectionDto } from './dto/connection.dto'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs';
import type { PrismaService } from '~/prisma/prisma.service'
import type { RedisService } from '@/redis/redis.service'
import {
    ConnectionStatus,
    type ResServerConnection,
    type ResErrData,
} from './micro.type'

export abstract class AbstractMicroService {
    protected clientProxy: ClientProxy
    protected readonly ResErrData: ResErrData
    protected readonly prismaService: PrismaService
    protected readonly redisService: RedisService
    protected readonly configService: ConfigService

    constructor(
        prismaService: PrismaService,
        redisService: RedisService,
        configService: ConfigService
    ) {
        this.configService = configService

        const host = configService.get<string>('WS_HOST', 'localhost');
        const port: number = Number(configService.get<string>('WS_PORT', ''));

        this.clientProxy = ClientProxyFactory.create({
            transport: Transport.TCP,
            options: {
                host: host,
                port: !isNaN(port) ? port : 6666,
            },
        });

        this.prismaService = prismaService
        this.redisService = redisService

        this.ResErrData = {
            message: 'Возникла ошибка при выполнении действия',
            status: ConnectionStatus.Error,
        }
    }

    protected async sendRequest<TPattern, TRequest, TResponce>(
        pattern: TPattern,
        data: TRequest,
    ): Promise<TResponce | ResErrData> {
        try {
            const response = await firstValueFrom(
                this.clientProxy.send<TResponce, TRequest>(pattern, data),
                { defaultValue: {...this.ResErrData} }
            );

            return response;
        } catch {
            return this.ResErrData;
        }
    }

    async abstractJoinRoom(connectionDto: ConnectionDto): Promise<ResServerConnection | ResErrData> {
        const redRes = this
        return this.ResErrData
    }

    async abstractLeaveRoom(connectionDto: ConnectionDto): Promise<ResServerConnection | ResErrData> {
        return this.ResErrData
    }
}
