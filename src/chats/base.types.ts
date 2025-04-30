// src/types/base.types.ts
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export enum WsConnectionStatus {
	Error = 'error',
	Success = 'success',
}

export enum WsServerMethod {
	JoinRoom = 'joinRoom',
	LeaveRoom = 'leaveRoom',
}

export enum WsClientMethods {
	Connect = 'connection',
}

export interface ResServerConnection {
	roomName: string
	telegramId: string
	status: WsConnectionStatus
}

export interface ResErrData {
	message: string
	status: WsConnectionStatus
}

export interface ClientToServerEvents {
	[WsServerMethod.JoinRoom]: (connection: ConnectionDto) => Promise<void>
	[WsServerMethod.LeaveRoom]: (connection: ConnectionDto) => Promise<void>
}

export interface ServerToClientEvents {
	[WsClientMethods.Connect]: (
		connection: ResServerConnection | ResErrData
	) => Promise<void>
}
