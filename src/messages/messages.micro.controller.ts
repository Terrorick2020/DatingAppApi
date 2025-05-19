import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { MessegesService } from './messages.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { UpdateMicroMsgDto } from './dto/update-msg.micro.dto'
import { CreateDto } from './dto/create.dto'

// Исправление: правильные паттерны для сообщений
enum MessagePatterns {
  SendMsg = 'sendMsg',
  UpdateMsg = 'updateMsg',
  UpdatePartner = 'updatePartner'
}

@Controller()
export class MessagesMicroController {
  constructor(
    private readonly messagesService: MessegesService,
    private readonly logger: AppLogger,
    private readonly redisPubSub: RedisPubSubService
  ) {}

  @MessagePattern(MessagePatterns.SendMsg)
  async handleSendMessage(@Payload() data: any) {
    this.logger.debug(
      `TCP: Отправка сообщения в чате ${data.chatId}`,
      'MessagesMicroController'
    )
    
    // Исправление: создаем правильный DTO
    const createDto = new CreateDto();
    createDto.chatId = data.chatId;
    createDto.telegramId = data.telegramId;
    createDto.toUser = data.toUser;
    createDto.msg = data.newMsg;
    createDto.roomName = data.roomName || data.telegramId; // Добавляем roomName
    
    const result = await this.messagesService.create(createDto)
    
    if (result.success && result.data) {
      // Публикуем сообщение в Redis Pub/Sub для WebSocket сервера
      await this.redisPubSub.publishNewMessage({
        chatId: data.chatId,
        messageId: result.data.id,
        senderId: data.telegramId,
        recipientId: data.toUser,
        text: data.newMsg,
        timestamp: result.data.created_at
      })
    }
    
    return result
  }

  @MessagePattern(MessagePatterns.UpdateMsg)
  async handleUpdateMessage(@Payload() data: UpdateMicroMsgDto) {
    this.logger.debug(
      `TCP: Обновление сообщения ${data.msgId} в чате ${data.chatId}`,
      'MessagesMicroController'
    )
    
    // Определение DTO для обновления сообщения
    const updateData = {
      chatId: data.chatId,
      telegramId: data.telegramId,
      roomName: data.roomName // Добавляем roomName
    }
    
    // Добавляем нужные поля в зависимости от типа обновления
    if (data.newMsgData) {
      // Обновление текста сообщения
      Object.assign(updateData, { 
        msg: data.newMsgData.msg,
        // другие поля, если необходимо
      })
    } else if (data.isReaded !== undefined) {
      // Обновление статуса прочтения
      Object.assign(updateData, { 
        isChecked: data.isReaded
      })
    }
    
    const result = await this.messagesService.update(data.msgId, updateData)
    return result
  }

  @MessagePattern(MessagePatterns.UpdatePartner)
  async handleUpdatePartner(@Payload() data: UpdateMicroPartnerDto) {
    this.logger.debug(
      `TCP: Обновление статуса партнера ${data.telegramId}`,
      'MessagesMicroController'
    )
    
    // Получаем данные о чате и участниках
    // Исправление: получаем данные иначе, так как chatId отсутствует в UpdateMicroPartnerDto
    const participants = []
    
    // Находим чаты с участием данного пользователя и его собеседников
    try {
      // Здесь логика определения чата и участников через Redis или Prisma
      // Например:
      const userChatsKey = `user:${data.telegramId}:chats`
      const roomChatsKey = `user:${data.roomName}:chats`
      
      // Имитация получения общего чата между пользователями
      const chatId = 'chat_id_123' // В реальном коде нужно определить правильный ID чата
      
      // Если есть newWriteStat, публикуем событие набора текста
      if (data.newWriteStat) {
        await this.redisPubSub.publishTypingStatus({
          chatId: chatId, // Используем найденный ID чата
          userId: data.telegramId,
          isTyping: data.newWriteStat === 'Write',
          participants: [data.telegramId, data.roomName] // Добавляем обоих участников
        })
      }
      
      // Если есть newLineStat, публикуем событие об изменении статуса
      if (data.newLineStat) {
        await this.redisPubSub.publishUserStatus({
          userId: data.telegramId,
          status: data.newLineStat === 'Online' ? 'online' : 'offline',
          notifyUsers: [data.roomName], // Уведомляем собеседника
          timestamp: Date.now()
        })
      }
    } catch (error: any) {
      this.logger.error(
        `Ошибка при обработке обновления статуса партнера`,
        error?.stack,
        'MessagesMicroController',
        { updatePartnerDto: data, error }
      )
    }
    
    return { status: 'success' }
  }

  @MessagePattern('getMessages')
  async getMessages(@Payload() data: { chatId: string, limit?: number, offset?: number }) {
    this.logger.debug(
      `TCP: Получение сообщений чата ${data.chatId}`,
      'MessagesMicroController'
    )
    
    const result = await this.messagesService.findAll({
      chatId: data.chatId,
      limit: data.limit,
      offset: data.offset
    })
    
    return result
  }

  @MessagePattern('joinRoom')
  async joinRoom(@Payload() data: ConnectionDto) {
    this.logger.debug(
      `TCP: Пользователь ${data.telegramId} присоединяется к комнате сообщений ${data.roomName}`,
      'MessagesMicroController'
    )
    
    return this.messagesService.joinRoom(data)
  }

  @MessagePattern('leaveRoom')
  async leaveRoom(@Payload() data: ConnectionDto) {
    this.logger.debug(
      `TCP: Пользователь ${data.telegramId} покидает комнату сообщений ${data.roomName}`,
      'MessagesMicroController'
    )
    
    return this.messagesService.leaveRoom(data)
  }
}