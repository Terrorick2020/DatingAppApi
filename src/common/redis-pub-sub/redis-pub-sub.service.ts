import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { AppLogger } from '../logger/logger.service'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly publisher: Redis
  private readonly CONTEXT = 'RedisPubSubService'

  constructor(
    private readonly logger: AppLogger,
    private readonly configService: ConfigService
  ) {
    this.publisher = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get('REDIS_PORT', '6379')),
      password: this.configService.get('REDIS_PASSWORD', ''),
      db: parseInt(this.configService.get('REDIS_DB', '0')),
    })
  }

  async onModuleInit() {
    this.logger.log('Redis Pub/Sub сервис инициализирован', this.CONTEXT)
  }

  async onModuleDestroy() {
    await this.publisher.quit()
    this.logger.log('Redis Pub/Sub соединение закрыто', this.CONTEXT)
  }

  /**
   * Публикация события в канал Redis
   */
  async publish(channel: string, message: any): Promise<void> {
    try {
      // Проверка типа сообщения и преобразование в JSON если нужно
      const messageString = typeof message === 'string' 
        ? message 
        : JSON.stringify(message)
      
      await this.publisher.publish(channel, messageString)
      this.logger.debug(`Событие опубликовано в канал ${channel}`, this.CONTEXT, { messageType: typeof message })
    } catch (error: any) {
      this.logger.error(
        `Ошибка при публикации события в канал ${channel}`,
        error?.stack,
        this.CONTEXT,
        { error, channel }
      )
    }
  }

  /**
   * Публикация уведомления о новом сообщении
   */
  async publishNewMessage(data: { 
    chatId: string, 
    messageId: string, 
    senderId: string, 
    recipientId: string,
    text: string, 
    timestamp: number,
    media_type?: string,
    media_url?: string
  }): Promise<void> {
    await this.publish('chat:newMessage', data)
  }

  /**
   * Публикация уведомления о прочтении сообщения
   */
  async publishMessageRead(data: {
    chatId: string,
    userId: string,
    messageIds: string[],
    timestamp: number
  }): Promise<void> {
    await this.publish('chat:messageRead', data)
  }

  /**
   * Публикация уведомления о статусе набора текста
   */
  async publishTypingStatus(data: {
    chatId: string,
    userId: string,
    isTyping: boolean,
    participants: string[]
  }): Promise<void> {
    await this.publish('chat:typing', data)
  }

  /**
   * Публикация уведомления о новом лайке
   */
  async publishNewLike(data: {
    fromUserId: string,
    toUserId: string,
    timestamp: number
  }): Promise<void> {
    await this.publish('like:new', data)
  }

  /**
   * Публикация уведомления о новом матче
   */
  async publishNewMatch(data: {
    user1Id: string,
    user2Id: string,
    chatId: string,
    timestamp: number
  }): Promise<void> {
    await this.publish('match:new', data)
  }

  /**
   * Публикация уведомления об изменении статуса жалобы
   */
  async publishComplaintUpdate(data: {
    id: string,
    fromUserId: string,
    reportedUserId: string,
    status: string,
    timestamp: number
  }): Promise<void> {
    await this.publish('complaint:update', data)
  }

  /**
   * Публикация уведомления об изменении статуса пользователя (онлайн/оффлайн)
   */
  async publishUserStatus(data: {
    userId: string,
    status: 'online' | 'offline',
    notifyUsers: string[],
    timestamp: number
  }): Promise<void> {
    await this.publish('user:status', data)
  }
}
