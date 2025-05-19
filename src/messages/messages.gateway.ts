import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { MessegesService } from './messages.service';
import { AppLogger } from '../common/logger/logger.service';
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service';

@WebSocketGateway({
  namespace: 'messages',
  cors: {
    origin: '*',
  },
})
export class MessagesGateway {
  constructor(
    private readonly messagesService: MessegesService,
    private readonly logger: AppLogger,
    private readonly redisPubSub: RedisPubSubService
  ) {}

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: { telegramId: string, roomName: string },
    @ConnectedSocket() client: Socket
  ) {
    this.logger.debug(
      `WS: Пользователь ${data.telegramId} присоединяется к комнате ${data.roomName}`,
      'MessagesGateway'
    );

    // Добавляем клиента в комнату
    client.join(data.roomName);

    // Обрабатываем подключение через сервис
    const result = await this.messagesService.joinRoom({
      telegramId: data.telegramId,
      roomName: data.roomName
    });

    return { success: true, message: 'Успешно присоединился к комнате' };
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() data: { telegramId: string, roomName: string },
    @ConnectedSocket() client: Socket
  ) {
    this.logger.debug(
      `WS: Пользователь ${data.telegramId} покидает комнату ${data.roomName}`,
      'MessagesGateway'
    );

    // Удаляем клиента из комнаты
    client.leave(data.roomName);

    // Обрабатываем отключение через сервис
    const result = await this.messagesService.leaveRoom({
      telegramId: data.telegramId,
      roomName: data.roomName
    });

    return { success: true, message: 'Успешно покинул комнату' };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: {
      chatId: string,
      telegramId: string,
      toUser: string,
      text: string,
      roomName: string
    },
    @ConnectedSocket() client: Socket
  ) {
    this.logger.debug(
      `WS: Отправка сообщения в чат ${data.chatId} от ${data.telegramId}`,
      'MessagesGateway'
    );

    // Создаем сообщение через сервис
    const result = await this.messagesService.create({
      chatId: data.chatId,
      telegramId: data.telegramId,
      toUser: data.toUser,
      msg: data.text,
      roomName: data.roomName
    });

    // Отправляем сообщение отправителю
    client.emit('message_sent', {
      success: result.success,
      data: result.data,
      message: result.message
    });

    // Отправляем сообщение получателю через его комнату
    if (result.success && result.data) {
      client.to(data.toUser).emit('new_message', {
        chatId: data.chatId,
        messageId: result.data.id,
        fromUser: data.telegramId,
        text: data.text,
        createdAt: result.data.created_at
      });
    }

    return result;
  }

  @SubscribeMessage('typing_status')
  async handleTypingStatus(
    @MessageBody() data: {
      chatId: string,
      telegramId: string,
      isTyping: boolean,
      roomName: string
    },
    @ConnectedSocket() client: Socket
  ) {
    this.logger.debug(
      `WS: Обновление статуса печатания в чате ${data.chatId} от ${data.telegramId}: ${data.isTyping}`,
      'MessagesGateway'
    );

    // Получаем данные чата для определения получателя
    const chatMetadata = await this.messagesService.findAll({ chatId: data.chatId });
    
    if (chatMetadata.success && chatMetadata.data) {
      // Определяем получателя (второго участника чата)
      const participants = ['получатель_id']; // Здесь нужно извлечь из данных чата

      // Публикуем статус набора текста
      await this.redisPubSub.publishTypingStatus({
        chatId: data.chatId,
        userId: data.telegramId,
        isTyping: data.isTyping,
        participants
      });

      // Оповещаем получателя через WebSocket
      client.to(participants[0]).emit('typing_status', {
        chatId: data.chatId,
        userId: data.telegramId,
        isTyping: data.isTyping
      });
    }

    return { success: true };
  }

  @SubscribeMessage('read_messages')
  async handleReadMessages(
    @MessageBody() data: {
      chatId: string,
      telegramId: string,
      lastReadMessageId: string,
      roomName: string
    },
    @ConnectedSocket() client: Socket
  ) {
    this.logger.debug(
      `WS: Отметка о прочтении сообщений в чате ${data.chatId} пользователем ${data.telegramId}`,
      'MessagesGateway'
    );

    // Обновляем статус прочтения через сервис
    const result = await this.messagesService.readMessages({
      chatId: data.chatId,
      userId: data.telegramId,
      lastReadMessageId: data.lastReadMessageId
    });

    // Публикуем событие прочтения сообщений
    if (result.success) {
      await this.redisPubSub.publishMessageRead({
        chatId: data.chatId,
        userId: data.telegramId,
        messageIds: [data.lastReadMessageId],
        timestamp: Date.now()
      });
    }

    return result;
  }
}