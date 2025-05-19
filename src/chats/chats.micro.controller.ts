import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { ChatsService } from './chats.service'
import { AppLogger } from '../common/logger/logger.service'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { AddChatMicroDto } from './dto/add-chat.dto'
import { DeleteChatDto } from './dto/delete-chat.dto'
import { UpdateChatMicroDto } from './dto/update-chat.micro.dto'
import { SendChatsTcpPatterns } from './chats.types'

@Controller()
export class ChatsMicroController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly logger: AppLogger
  ) {}

  @MessagePattern('getUserChats')
  async getUserChats(@Payload() data: { userId: string }) {
    this.logger.debug(
      `TCP: Получение чатов пользователя ${data.userId}`,
      'ChatsMicroController'
    )
    return this.chatsService.findAll({ telegramId: data.userId })
  }

  @MessagePattern('getChatDetails')
  async getChatDetails(@Payload() data: { chatId: string }) {
    this.logger.debug(
      `TCP: Получение деталей чата ${data.chatId}`,
      'ChatsMicroController'
    )
    
    const chatData = await this.chatsService.getChatMetadata(data.chatId)
    const messages = await this.chatsService.getChatMessages(data.chatId, 1, 0) // Получаем только последнее сообщение
    const readStatus = await this.chatsService.getReadStatus(data.chatId)
    
    return {
      id: data.chatId,
      metadata: chatData.success ? chatData.data : null,
      lastMessage: messages.success && messages.data && messages.data.length > 0 ? messages.data[0] : null,
      readStatus: readStatus.success ? readStatus.data : {}
    }
  }

  @MessagePattern(SendChatsTcpPatterns.UpdatedChat)
  async handleUpdateChat(@Payload() data: UpdateChatMicroDto) {
    this.logger.debug(
      `TCP: Обновление чата ${data.chatId}`,
      'ChatsMicroController'
    )
    
    // Обновление метаданных чата
    if (data.newLastMsgId) {
      const chatData = await this.chatsService.getChatMetadata(data.chatId)
      
      if (chatData.success && chatData.data) {
        const chat = chatData.data
        chat.last_message_id = data.newLastMsgId
        
        // Сохраняем обновленные метаданные
        // Обычно здесь нужна дополнительная логика для обновления
      }
    }
    
    return { status: 'success', chatId: data.chatId }
  }

  @MessagePattern(SendChatsTcpPatterns.AddChat)
  async handleAddChat(@Payload() data: AddChatMicroDto) {
    this.logger.debug(
      `TCP: Добавление чата ${data.chatId}`,
      'ChatsMicroController'
    )
    
    // Создание чата если он не существует
    const existingChat = await this.chatsService.getChatMetadata(data.chatId)
    
    if (!existingChat.success || !existingChat.data) {
      // Создаем чат с использованием существующего сервиса
      await this.chatsService.create({
        telegramId: data.telegramId,
        toUser: data.toUser.id
      })
    }
    
    return { status: 'success', chatId: data.chatId }
  }

  @MessagePattern(SendChatsTcpPatterns.DeleteChat)
  async handleDeleteChat(@Payload() data: DeleteChatDto) {
    this.logger.debug(
      `TCP: Удаление чата ${data.chatId}`,
      'ChatsMicroController'
    )
    
    const result = await this.chatsService.delete(data.chatId)
    return result
  }

  @MessagePattern('joinRoom')
  async joinRoom(@Payload() data: ConnectionDto) {
    this.logger.debug(
      `TCP: Пользователь ${data.telegramId} присоединяется к комнате ${data.roomName}`,
      'ChatsMicroController'
    )
    
    // Здесь можно добавить логику для обработки присоединения к комнате
    // Например, обновить статус пользователя на "онлайн"
    
    return {
      roomName: data.roomName,
      telegramId: data.telegramId,
      status: 'success'
    }
  }

  @MessagePattern('leaveRoom')
  async leaveRoom(@Payload() data: ConnectionDto) {
    this.logger.debug(
      `TCP: Пользователь ${data.telegramId} покидает комнату ${data.roomName}`,
      'ChatsMicroController'
    )
    
    // Здесь можно добавить логику для обработки отключения от комнаты
    // Например, обновить статус пользователя на "оффлайн"
    
    return {
      roomName: data.roomName,
      telegramId: data.telegramId,
      status: 'success'
    }
  }
}