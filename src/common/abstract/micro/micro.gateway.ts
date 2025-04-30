// src/abstract/abstract.geteway.ts
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketServer,
} from '@nestjs/websockets';

import {
    WsConnectionStatus,
    WsClientMethods,
    WsServerMethod,
    type ClientToServerEvents,
    type ServerToClientEvents,
    type ResServerConnection,
    type ResErrData,
} from '@/chats/base.types';

import { Server, Socket } from 'socket.io';
import { ConnectionDto } from './dto/connection.dto';

export abstract class BaseWsGateway<
    TClientToServerEvents extends ClientToServerEvents,
    TServerToClientEvents extends ServerToClientEvents
> {
    @WebSocketServer()
    protected server: Server<TClientToServerEvents, TServerToClientEvents>;

    protected abstract joinRoomService(
        connectionDto: ConnectionDto,
    ): Promise<ResServerConnection | ResErrData>;

    protected abstract leaveRoomService(
        connectionDto: ConnectionDto,
    ): Promise<ResServerConnection | ResErrData>;

    @SubscribeMessage(WsServerMethod.JoinRoom)
    async handleJoinRoom(
        @MessageBody() connectionDto: ConnectionDto,
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        const resJoinRoom: ResServerConnection | ResErrData = await this.joinRoomService(connectionDto);

        if (resJoinRoom.status === WsConnectionStatus.Success) {
            client.join(connectionDto.roomName);
        }

        client.emit(WsClientMethods.Connect, resJoinRoom);
    }

    @SubscribeMessage(WsServerMethod.LeaveRoom)
    async handleLeaveRoom(
        @MessageBody() connectionDto: ConnectionDto,
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        const resLeaveRoom: ResServerConnection | ResErrData = await this.leaveRoomService(connectionDto);

        client.leave(connectionDto.roomName);
        client.emit(WsClientMethods.Connect, resLeaveRoom);
    }
}