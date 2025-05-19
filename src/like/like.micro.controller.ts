import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { LikeService } from './like.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { MatchMicroDto } from './dto/match-like.micro.dto'
import { SendMatchTcpPatterns } from './like.types'

@Controller()
export class LikeMicroController {
  constructor(
    private readonly likeService: LikeService,
    private readonly logger: AppLogger,
    private readonly redisPubSub: RedisPubSubService
  ) {}

  @MessagePattern('getUserLikes')
  async getUserLikes(@Payload() data: { userId: string, type: 'sent' | 'received' | 'matches' }) {
    this.logger.debug(
      `TCP: Получение лайков пользователя ${data.userId} типа ${data.type}`,
      'LikeMicroController'
    )
    
    const result = await this.likeService.getLikes({
      telegramId: data.userId,
      type: data.type
    })
    
    return result
  }

  @MessagePattern('createLike')
  async createLike(@Payload() data: { fromUserId: string, toUserId: string }) {
    this.logger.debug(
      `TCP: Создание лайка от ${data.fromUserId} к ${data.toUserId}`,
      'LikeMicroController'
    )
    
    const result = await this.likeService.createLike({
      fromUserId: data.fromUserId,
      toUserId: data.toUserId
    })
    
    if (result.success) {
      // Публикуем событие нового лайка в Redis Pub/Sub
      await this.redisPubSub.publishNewLike({
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        timestamp: Date.now()
      })
      
      // Если образовался матч, публикуем событие матча
      if (result.data?.isMatch) {
        await this.redisPubSub.publishNewMatch({
          user1Id: data.fromUserId,
          user2Id: data.toUserId,
          chatId: result.data.chatId || '',
          timestamp: Date.now()
        })
      }
    }
    
    return result
  }

  @MessagePattern('deleteLike')
  async deleteLike(@Payload() data: { fromUserId: string, toUserId: string }) {
    this.logger.debug(
      `TCP: Удаление лайка от ${data.fromUserId} к ${data.toUserId}`,
      'LikeMicroController'
    )
    
    const result = await this.likeService.deleteLike(data.fromUserId, data.toUserId)
    return result
  }

  @MessagePattern(SendMatchTcpPatterns.Trigger)
  async handleMatchTrigger(@Payload() data: MatchMicroDto) {
    this.logger.debug(
      `TCP: Уведомление о матче для ${data.telegramId} от ${data.fromUser.telegramId}`,
      'LikeMicroController'
    )
    
    // Обработка матча
    // В данном случае просто возвращаем данные для отправки в WebSocket
    
    return {
      status: 'success',
      matchData: {
        fromUser: data.fromUser,
        toUser: data.telegramId,
        isTrigger: data.isTrigger,
        timestamp: Date.now()
      }
    }
  }
}