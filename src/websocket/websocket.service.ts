import { Injectable } from '@nestjs/common'
import { Server } from 'socket.io'
import { Logger } from '@nestjs/common'

@Injectable()
export class WebSocketService {
	private server: Server
	private readonly logger = new Logger(WebSocketService.name)

	setServer(server: Server) {
		this.server = server
	}

	/**
	 * Отправляет событие конкретному пользователю
	 */
	sendToUser(userId: string, event: string, data: any) {
		if (!this.server) {
			this.logger.error('Server не инициализирован в WebSocketService')
			return
		}

		this.server.to(userId).emit(event, data)
		this.logger.debug(`Событие ${event} отправлено пользователю ${userId}`)
	}

	/**
	 * Отправляет событие в комнату
	 */
	sendToRoom(roomName: string, event: string, data: any) {
		if (!this.server) {
			this.logger.error('Server не инициализирован в WebSocketService')
			return
		}

		this.server.to(roomName).emit(event, data)
		this.logger.debug(`Событие ${event} отправлено в комнату ${roomName}`)
	}

	/**
	 * Широковещательная отправка всем подключенным клиентам
	 */
	broadcast(event: string, data: any) {
		if (!this.server) {
			this.logger.error('Server не инициализирован в WebSocketService')
			return
		}

		this.server.emit(event, data)
		this.logger.debug(`Событие ${event} отправлено всем пользователям`)
	}
}
