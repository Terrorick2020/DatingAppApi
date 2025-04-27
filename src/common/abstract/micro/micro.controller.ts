import { ConnectionDto } from './dto/connection.dto'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { MicroService } from './micro.service'
import { TcpPattern } from './micro.type'

export abstract class MicroController<TService extends MicroService>{
    protected readonly microService: TService

    constructor(service: TService) {
        this.microService = service
    }

    @MessagePattern(TcpPattern.JoinRoom)
    async joinRoom (@Payload() connectionDto: ConnectionDto ): Promise<void> {
        await this.microService.joinRoom(connectionDto)
    }

    @MessagePattern(TcpPattern.LeaveRoom)
    async leaveRoom(@Payload() connectionDto: ConnectionDto ): Promise<void> {
        await this.microService.leaveRoom(connectionDto)
    }
}
