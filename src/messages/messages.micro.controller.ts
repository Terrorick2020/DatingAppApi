import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { MessegesService } from './messages.service'
import { AppLogger } from '../common/logger/logger.service'
import { SendMsgsTcpPatterns } from './messages.type'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { UpdateMicroMsgDto } from './dto/update-msg.micro.dto'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'

@Controller()
export class MessagesMicroController {
  constructor(
    private readonly messagesService: MessegesService,
    private readonly logger: AppLogger,
    private readonly redisPubSub: RedisPubSubService
  ) {}

  @MessagePattern(SendMsgsTcpPatterns.SendMsg)
  async handleSendMessage(@Payload() data: any) {
    this.logger.debug(
      `TCP: Отправка сообщения в чат ${data.chatId}`,
      'MessagesMicroController'
    )
    
    const result = await this.messagesService.create({
      chatId: data.chatId,
      telegramId: data.telegramId,
      toUser: data.toUser,
      msg: data.newMsg
    })
    
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

  @MessagePattern(SendMsgsTcpPatterns.UpdateMsg)
  async handleUpdateMessage(@Payload() data: UpdateMicroMsgDto) {
    this.logger.debug(
      `TCP: Обновление сообщения ${data.msgId} в чате ${data.chatId}`,
      'MessagesMicroController'
    )
    
    // Определение DTO для обновления сообщения
    const updateData = {
      chatId: data.chatId,
      telegramId: data.telegramId
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

  @MessagePattern(SendMsgsTcpPatterns.UpdatePartner)
  async handleUpdatePartner(@Payload() data: UpdateMicroPartnerDto) {
    this.logger.debug(
      `TCP: Обновление статуса партнера ${data.telegramId}`,
      'MessagesMicroController'
    )
    
    // Получаем данные о чате (для определения участников)
    const chatResult = await this.messagesService.findAll({ chatId: data.chatId })
    
    if (chatResult.success && chatResult.data) {
      // Определяем участников чата
      const participants = []
      
      // В реальном сценарии, вам нужно получить список участников из данных чата
      // Например: participants = chatResult.data.participants
      
      // Публикуем событие в Redis Pub/Sub
      if (data.newWriteStat) {
        await this.redisPubSub.publishTypingStatus({
          chatId: data.chatId,
          userId: data.telegramId,
          isTyping: data.newWriteStat === 'Write',
          participants
        })
      }
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