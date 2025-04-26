import { Controller } from '@nestjs/common'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { AbstractMicroController } from '@/common/abstract/micro/micro.controller'
import { GetChatsPattern, SendChatsPattern } from './chats.types'
import { ChatsMicroserviceService } from './chats.micro.service'
import { FindDto } from './dto/find.dto'
import {
    ConnectionStatus, 
    type ResServerConnection,
    type ResErrData,
} from '@/common/abstract/micro/micro.type'

@Controller()
export class ChatsMicroserviceController extends AbstractMicroController {
	constructor(private readonly chatsMicroService: ChatsMicroserviceService) {
        super()
    }

	protected async abstractJoinRoom(
		connectionDto: ConnectionDto,
	): Promise<ResServerConnection | ResErrData> {
		return this.chatsMicroService.joinRoom(connectionDto)
	}

	protected async abstractLeaveRoom(
		connectionDto: ConnectionDto,
	): Promise<ResServerConnection | ResErrData> {
		return this.chatsMicroService.leaveRoom(connectionDto)
	}

	@MessagePattern(GetChatsPattern.JoinChatsRoom)
	async handleJoinRoom(@Payload() connectionDto: ConnectionDto): Promise<ResServerConnection | ResErrData> {
	  return await this.abstractJoinRoom(connectionDto)
	}
  
	@MessagePattern(GetChatsPattern.LeaveChatsRoom)
	async handleLeaveRoom(@Payload() connectionDto: ConnectionDto): Promise<ResServerConnection | ResErrData> {
		return await this.abstractLeaveRoom(connectionDto)
	}
}
