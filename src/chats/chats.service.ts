// src/chats/chats.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '~/prisma/prisma.service';
import { AppLogger } from '../common/logger/logger.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CreateDto } from './dto/create.dto';
import { FindDto } from './dto/find.dto';
import { ReadMessagesDto } from './dto/read-messages.dto';
import { SendMessageDto } from './dto/send-messages.dto';
import { TypingStatusDto } from './dto/typing-status.dto';
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service';
import {
  errorResponse,
  successResponse,
} from '@/common/helpers/api.response.helper';
import type { ApiResponse } from '@/common/interfaces/api-response.interface';
import * as cron from 'node-cron';
import { v4 } from 'uuid';
import { FindAllChatsUserFields } from '~/prisma/selects/chats.selects';
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto';
import { ConnectionStatus } from '../common/abstract/micro/micro.type';
import type { ChatPreview, ResCreateChat } from './chats.types';
import { type Chat, type ChatMsg } from './chats.types';
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto';

@Injectable()
export class ChatsService implements OnModuleInit, OnModuleDestroy {
  private readonly CHAT_TTL = 86400; // 24 часа в секундах
  private readonly CACHE_TTL = 900; // 15 минут в секундах для превью чатов
  private cleanupTask: cron.ScheduledTask | null = null;
  private readonly lockKey = 'chat_cleanup_lock';
  private readonly lockDuration = 600; // 10 минут блокировки для очистки
  private readonly CONTEXT = 'ChatsService';

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
    private readonly logger: AppLogger,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  /**
   * Инициализация сервиса чатов
   */
  async onModuleInit() {
    // Запускаем задачу очистки каждые 6 часов, но с проверкой блокировки
    this.cleanupTask = cron.schedule('0 */6 * * *', async () => {
      try {
        await this.runChatCleanupWithLock();
      } catch (error: any) {
        this.logger.error(
          'Ошибка при очистке устаревших чатов',
          error?.stack,
          this.CONTEXT,
          { error },
        );
      }
    });
    this.logger.log('Задача очистки чатов инициализирована', this.CONTEXT);
  }

  /**
   * Корректное завершение работы сервиса
   */
  onModuleDestroy() {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.logger.log('Задача очистки чатов остановлена', this.CONTEXT);
    }
  }

  /**
   * Получение метаданных чата
   */
  async getChatMetadata(chatId: string): Promise<ApiResponse<Chat>> {
    try {
      const chatKey = `chat:${chatId}`;
      const chatData = await this.redisService.getKey(chatKey);

      if (!chatData.success || !chatData.data) {
        this.logger.debug(`Чат ${chatId} не найден`, this.CONTEXT);
        return errorResponse('Чат не найден');
      }

      const chat: Chat = JSON.parse(chatData.data);

      if (!chat || !chat.id || !Array.isArray(chat.participants)) {
        this.logger.warn(
          `Неверный формат данных чата ${chatId}`,
          this.CONTEXT,
          { chat },
        );
        return errorResponse('Неверный формат данных чата');
      }

      this.logger.debug(
        `Метаданные чата ${chatId} успешно получены`,
        this.CONTEXT,
      );
      return successResponse<Chat>(chat, 'Метаданные чата получены');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при получении метаданных чата ${chatId}`,
        error?.stack,
        this.CONTEXT,
        { chatId, error },
      );
      return errorResponse('Ошибка при получении метаданных чата', error);
    }
  }

  /**
   * Получение статуса прочтения для чата
   */
  async getReadStatus(
    chatId: string,
  ): Promise<ApiResponse<Record<string, string | null>>> {
    try {
      const readStatusKey = `chat:${chatId}:read_status`;
      const readStatus = await this.redisService.getKey(readStatusKey);

      if (!readStatus.success || !readStatus.data) {
        this.logger.debug(
          `Статус прочтения для чата ${chatId} не найден`,
          this.CONTEXT,
        );
        return errorResponse('Статус прочтения не найден');
      }

      const readStatusData = JSON.parse(readStatus.data);
      this.logger.debug(
        `Статус прочтения для чата ${chatId} получен`,
        this.CONTEXT,
      );
      return successResponse(readStatusData, 'Статус прочтения получен');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при получении статуса прочтения для чата ${chatId}`,
        error?.stack,
        this.CONTEXT,
        { chatId, error },
      );
      return errorResponse('Ошибка при получении статуса прочтения', error);
    }
  }

  /**
   * Получение сообщений чата
   */
  async getChatMessages(
    chatId: string,
    limit = 50,
    offset = 0,
  ): Promise<ApiResponse<ChatMsg[]>> {
    try {
      const messagesKey = `chat:${chatId}:messages`;
      const orderKey = `chat:${chatId}:order`;

      // Получаем упорядоченный список ID сообщений
      const messageIdsResponse = await this.redisService.getZRevRange(
        orderKey,
        offset,
        offset + limit - 1,
      );

      if (!messageIdsResponse.success || !messageIdsResponse.data) {
        this.logger.debug(
          `Сообщения для чата ${chatId} не найдены`,
          this.CONTEXT,
          { limit, offset },
        );
        return errorResponse('Сообщения не найдены');
      }

      const messageIds = messageIdsResponse.data;

      // Если сообщений нет, возвращаем пустой массив
      if (messageIds.length === 0) {
        this.logger.debug(`В чате ${chatId} нет сообщений`, this.CONTEXT, {
          limit,
          offset,
        });
        return successResponse([], 'Сообщения не найдены');
      }

      // Получаем сообщения по их ID
      const messagesResponse = await this.redisService.getHashMultiple(
        messagesKey,
        messageIds,
      );

      if (!messagesResponse.success || !messagesResponse.data) {
        this.logger.warn(
          `Ошибка при получении сообщений чата ${chatId}`,
          this.CONTEXT,
          { messageIds },
        );
        return errorResponse('Ошибка при получении сообщений');
      }

      // Парсим и валидируем сообщения
      const messages: ChatMsg[] = messagesResponse.data
        .map(msgStr => {
          try {
            // Проверка на null, так как некоторые сообщения могут отсутствовать
            if (msgStr === null) return null;
            const msg: ChatMsg = JSON.parse(msgStr);
            if (!msg || !msg.id || !msg.chatId || !msg.fromUser) {
              this.logger.debug(`Сообщение не прошло валидацию`, this.CONTEXT, {
                msg,
              });
              return null;
            }
            return msg;
          } catch (e) {
            this.logger.debug(`Ошибка при парсинге сообщения`, this.CONTEXT, {
              error: e,
              msgStr,
            });
            return null;
          }
        })
        .filter(Boolean) as ChatMsg[];

      this.logger.debug(
        `Получено ${messages.length} сообщений для чата ${chatId}`,
        this.CONTEXT,
        { messageCount: messages.length, limit, offset },
      );
      return successResponse<ChatMsg[]>(messages, 'Сообщения чата получены');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при получении сообщений чата ${chatId}`,
        error?.stack,
        this.CONTEXT,
        { chatId, limit, offset, error },
      );
      return errorResponse('Ошибка при получении сообщений чата', error);
    }
  }

  /**
   * Получение всех чатов пользователя с оптимизированным кешированием превью
   */
  async findAll(findDto: FindDto): Promise<ApiResponse<ChatPreview[]>> {
    try {
      const { telegramId } = findDto;
      this.logger.debug(
        `Получение списка чатов для пользователя ${telegramId}`,
        this.CONTEXT,
      );

      const userChatsKey = `user:${telegramId}:chats`;
      const previewCacheKey = `user:${telegramId}:chats_preview`;

      // Пробуем получить кешированные превью
      const cachedPreviewsResponse = await this.redisService.getKey(previewCacheKey);
      if (cachedPreviewsResponse.success && cachedPreviewsResponse.data) {
        try {
          const cachedPreviews = JSON.parse(
            cachedPreviewsResponse.data,
          ) as ChatPreview[];
          this.logger.debug(
            `Получены кешированные превью чатов для пользователя ${telegramId}`,
            this.CONTEXT,
            { count: cachedPreviews.length },
          );
          return successResponse(cachedPreviews, 'Список чатов получен из кеша');
        } catch (e) {
          // В случае ошибки парсинга продолжаем и загружаем превью заново
          this.logger.warn(
            `Ошибка при парсинге кеша превью для пользователя ${telegramId}`,
            this.CONTEXT,
            { error: e },
          );
        }
      }

      // Получаем список ID чатов пользователя
      const userChatsResponse = await this.redisService.getKey(userChatsKey);

      if (!userChatsResponse.success || !userChatsResponse.data) {
        this.logger.debug(
          `У пользователя ${telegramId} нет чатов`,
          this.CONTEXT,
        );
        return successResponse([], 'У пользователя нет чатов');
      }

      const chatIds = JSON.parse(userChatsResponse.data);

      if (!Array.isArray(chatIds) || chatIds.length === 0) {
        this.logger.debug(
          `У пользователя ${telegramId} пустой список чатов`,
          this.CONTEXT,
        );
        return successResponse([], 'У пользователя нет чатов');
      }

      // Проверяем существование пользователя перед загрузкой чатов
      const user = await this.prismaService.user.findUnique({
        where: {
          telegramId,
          status: {
            not: 'Blocked',
          },
        },
      });

      if (!user) {
        this.logger.warn(
          `Пользователь ${telegramId} не найден или заблокирован`,
          this.CONTEXT,
        );
        return errorResponse('Пользователь не найден или заблокирован');
      }

      this.logger.debug(
        `Загружаем метаданные для ${chatIds.length} чатов пользователя ${telegramId}`,
        this.CONTEXT,
      );

      // Получаем превью для каждого чата (пакетный запрос для оптимизации)
      const metadataPromises = chatIds.map(chatId =>
        this.getChatMetadata(chatId),
      );
      const metadataResults = await Promise.all(metadataPromises);

      // Фильтруем только успешные результаты
      const validChats = metadataResults
        .filter(result => result.success && result.data)
        .map(result => result.data as Chat);

      this.logger.debug(
        `Получено ${validChats.length} валидных чатов из ${chatIds.length}`,
        this.CONTEXT,
      );

      // Получаем все ID собеседников
      const interlocutorIds = validChats
        .map(chat => chat.participants.find(id => id !== telegramId))
        .filter(Boolean) as string[];

      // Получаем данные всех собеседников одним запросом
      const users = await this.prismaService.user.findMany({
        where: {
          telegramId: {
            in: interlocutorIds,
          },
          status: {
            not: 'Blocked',
          },
        },
        select: FindAllChatsUserFields,
      });

      this.logger.debug(
        `Получены данные ${users.length} собеседников`,
        this.CONTEXT,
      );

      // Создаем словарь пользователей для быстрого доступа
      const usersMap = new Map(users.map(user => [user.telegramId, user]));

      // Получаем все статусы прочтения одним запросом
      const readStatusPromises = validChats.map(chat =>
        this.getReadStatus(chat.id),
      );
      const readStatusResults = await Promise.all(readStatusPromises);

      // Создаем словарь статусов прочтения
      const readStatusMap = new Map(
        readStatusResults
          .filter(result => result.success && result.data)
          .map((result, index) => [validChats[index].id, result.data]),
      );

      // Получаем последние сообщения (можно оптимизировать пакетным запросом)
      const chatPreviews: ChatPreview[] = [];

      for (const chat of validChats) {
        // Находим другого участника
        const interlocutorId = chat.participants.find(id => id !== telegramId);
        if (!interlocutorId) {
          this.logger.debug(
            `Не найден собеседник в чате ${chat.id}`,
            this.CONTEXT,
          );
          continue;
        }

        // Получаем данные собеседника из кеша
        const user = usersMap.get(interlocutorId);
        if (!user) {
          this.logger.debug(
            `Не найдены данные пользователя ${interlocutorId} для чата ${chat.id}`,
            this.CONTEXT,
          );
          continue;
        }

        // Получаем статус прочтения из кеша
        const readStatus = readStatusMap.get(chat.id);
        const lastReadMessageId = readStatus?.[telegramId] || null;

        // Получаем последнее сообщение
        let lastMessage: ChatMsg | null = null;
        let unreadCount = 0;

        if (chat.last_message_id) {
          const messageKey = `chat:${chat.id}:messages`;
          const lastMessageResponse = await this.redisService.getHashField(
            messageKey,
            chat.last_message_id,
          );

          if (lastMessageResponse.success && lastMessageResponse.data) {
            try {
              lastMessage = JSON.parse(lastMessageResponse.data);
            } catch (e) {
              this.logger.debug(
                `Ошибка при парсинге последнего сообщения в чате ${chat.id}`,
                this.CONTEXT,
                { error: e },
              );
            }
          }

          // Считаем непрочитанные сообщения
          if (lastReadMessageId && lastReadMessageId !== chat.last_message_id) {
            const orderKey = `chat:${chat.id}:order`;
            const unreadMessagesResponse = await this.redisService.countMessagesAfter(
              orderKey,
              lastReadMessageId,
            );

            if (unreadMessagesResponse.success && unreadMessagesResponse.data) {
              unreadCount = unreadMessagesResponse.data;
            }
          }
        }

        // Формируем превью чата
        chatPreviews.push({
          chatId: chat.id,
          toUser: {
            id: user.telegramId,
            avatar: user.photos[0]?.key || '',
            name: user.name,
          },
          lastMsg: lastMessage?.text || '',
          created_at: chat.created_at,
          unread_count: unreadCount,
        });
      }

      // Сортируем по дате последнего сообщения (по убыванию)
      chatPreviews.sort((a, b) => b.created_at - a.created_at);

      this.logger.debug(
        `Сформировано ${chatPreviews.length} превью чатов для пользователя ${telegramId}`,
        this.CONTEXT,
      );

      // Кешируем результат на 15 минут
      await this.redisService.setKey(
        previewCacheKey,
        JSON.stringify(chatPreviews),
        this.CACHE_TTL,
      );

      return successResponse(chatPreviews, 'Список чатов получен');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при получении списка чатов для пользователя ${findDto.telegramId}`,
        error?.stack,
        this.CONTEXT,
        { telegramId: findDto.telegramId, error },
      );
      return errorResponse('Ошибка при получении списка чатов', error);
    }
  }

  /**
   * Создание нового чата
   */
  async create(createDto: CreateDto): Promise<ApiResponse<ResCreateChat>> {
    try {
      const { telegramId, toUser } = createDto;

      this.logger.debug(
        `Создание чата между пользователями ${telegramId} и ${toUser}`,
        this.CONTEXT,
      );

      // Проверяем существование пользователей
      const [sender, receiver] = await Promise.all([
        this.prismaService.user.findUnique({
          where: { telegramId, status: { not: 'Blocked' } },
        }),
        this.prismaService.user.findUnique({
          where: { telegramId: toUser, status: { not: 'Blocked' } },
        }),
      ]);

      if (!sender) {
        this.logger.warn(
          `Отправитель ${telegramId} не найден или заблокирован`,
          this.CONTEXT,
        );
        return errorResponse('Отправитель не найден или заблокирован');
      }

      if (!receiver) {
        this.logger.warn(
          `Получатель ${toUser} не найден или заблокирован`,
          this.CONTEXT,
        );
        return errorResponse('Получатель не найден или заблокирован');
      }

      // Проверяем, существует ли уже чат между этими пользователями
      const existingChatId = await this.findExistingChat(telegramId, toUser);

      if (existingChatId) {
        this.logger.debug(
          `Найден существующий чат ${existingChatId} между пользователями ${telegramId} и ${toUser}`,
          this.CONTEXT,
        );

        // Продлеваем TTL для существующего чата
        await this.extendChatTTL(existingChatId);

        // Инвалидируем кеш превью
        await this.invalidateChatsPreviewCache(telegramId);
        await this.invalidateChatsPreviewCache(toUser);

        return successResponse(
          { chatId: existingChatId, toUser },
          'Чат уже существует',
        );
      }

      // Создаем новый чат
      const chatId = v4();
      const timestamp = Date.now();

      this.logger.debug(
        `Создание нового чата ${chatId} между пользователями ${telegramId} и ${toUser}`,
        this.CONTEXT,
      );

      // Метаданные чата
      const chatMetadata: Chat = {
        id: chatId,
        participants: [telegramId, toUser],
        created_at: timestamp,
        last_message_id: null,
        typing: [], // Инициализируем пустой массив
      };

      // Статус прочтения
      const readStatus = {
        [telegramId]: null,
        [toUser]: null,
      };

      // Сохраняем данные в Redis с точным TTL
      await Promise.all([
        this.redisService.setKey(
          `chat:${chatId}`,
          JSON.stringify(chatMetadata),
          this.CHAT_TTL,
        ),
        this.redisService.setKey(
          `chat:${chatId}:read_status`,
          JSON.stringify(readStatus),
          this.CHAT_TTL,
        ),
      ]);

      // Добавляем чат в списки чатов пользователей
      await Promise.all([
        this.addChatToUserList(telegramId, chatId),
        this.addChatToUserList(toUser, chatId),
      ]);

      // Инвалидируем кеш превью
      await this.invalidateChatsPreviewCache(telegramId);
      await this.invalidateChatsPreviewCache(toUser);

      // Отправляем уведомления через Redis Pub/Sub для WebSocket сервера
      // Получаем данные для отправки в уведомлении
      const userData = await this.prismaService.user.findUnique({
        where: { telegramId },
        select: {
          name: true,
          photos: { take: 1 }
        }
      });

      const receiverData = await this.prismaService.user.findUnique({
        where: { telegramId: toUser },
        select: {
          name: true,
          photos: { take: 1 }
        }
      });

      // Публикуем событие создания чата для обоих участников
      for (const participant of [telegramId, toUser]) {
        // Определяем данные собеседника для этого участника
        const otherParticipant = participant === telegramId ? toUser : telegramId;
        const otherUserData = participant === telegramId ? receiverData : userData;
        
        await this.redisPubSubService.publish('chat:new', {
          userId: participant,
          chatId,
          withUser: {
            id: otherParticipant,
            name: otherUserData?.name || 'Unknown',
            avatar: otherUserData?.photos?.[0]?.key || '',
          },
          created_at: timestamp,
          timestamp
        });
      }

      this.logger.debug(`Чат ${chatId} успешно создан`, this.CONTEXT);

      return successResponse({ chatId, toUser }, 'Чат успешно создан');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при создании чата`,
        error?.stack,
        this.CONTEXT,
        { dto: createDto, error },
      );
      return errorResponse('Ошибка при создании чата', error);
    }
  }

  /**
   * Отправка сообщения в чат
   */
  async sendMessage(dto: SendMessageDto): Promise<ApiResponse<ChatMsg>> {
    try {
      const { chatId, fromUser, text } = dto;

      this.logger.debug(
        `Отправка сообщения в чат ${chatId} от пользователя ${fromUser}`,
        this.CONTEXT,
      );

      // Проверяем существование чата
      const chatMetadata = await this.getChatMetadata(chatId);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Попытка отправить сообщение в несуществующий чат ${chatId}`,
          this.CONTEXT,
        );
        return errorResponse('Чат не найден');
      }

      const chat = chatMetadata.data;

      // Проверяем, является ли пользователь участником чата
      if (!chat.participants.includes(fromUser)) {
        this.logger.warn(
          `Пользователь ${fromUser} не является участником чата ${chatId}`,
          this.CONTEXT,
        );
        return errorResponse('Вы не являетесь участником этого чата');
      }

      // Проверяем, не заблокирован ли пользователь
      const sender = await this.prismaService.user.findUnique({
        where: { telegramId: fromUser, status: { not: 'Blocked' } },
      });

      if (!sender) {
        this.logger.warn(
          `Отправитель ${fromUser} не найден или заблокирован`,
          this.CONTEXT,
        );
        return errorResponse('Отправитель не найден или заблокирован');
      }

      // Создаем новое сообщение
      const messageId = v4();
      const timestamp = Date.now();

      const message: ChatMsg = {
        id: messageId,
        chatId,
        fromUser,
        text,
        created_at: timestamp,
        updated_at: timestamp,
        is_read: false,
      };

      // Сохраняем сообщение
      const messagesKey = `chat:${chatId}:messages`;
      await this.redisService.setHashField(
        messagesKey,
        messageId,
        JSON.stringify(message),
      );

      // Обновляем порядок сообщений
      const orderKey = `chat:${chatId}:order`;
      await this.redisService.addToSortedSet(orderKey, timestamp, messageId);

      // Обновляем метаданные чата
      chat.last_message_id = messageId;

      // Если пользователь был в списке набирающих текст, удаляем его
      if (chat.typing && chat.typing.includes(fromUser)) {
        chat.typing = chat.typing.filter(id => id !== fromUser);
      }

      await this.redisService.setKey(
        `chat:${chatId}`,
        JSON.stringify(chat),
        this.CHAT_TTL,
      );

      // Продлеваем TTL для всех ключей, связанных с чатом
      await this.extendChatTTL(chatId);

      // Инвалидируем кеш превью для обоих участников
      for (const userId of chat.participants) {
        await this.invalidateChatsPreviewCache(userId);
      }

      // Находим получателя сообщения
      const recipientId = chat.participants.find(id => id !== fromUser);

      // Отправляем уведомление через Redis Pub/Sub
      if (recipientId) {
        await this.redisPubSubService.publishNewMessage({
          chatId,
          messageId,
          senderId: fromUser,
          recipientId,
          text,
          timestamp,
          media_type: undefined,
          media_url: undefined
        });
      }

      this.logger.debug(
        `Сообщение ${messageId} успешно отправлено в чат ${chatId}`,
        this.CONTEXT,
      );

      return successResponse(message, 'Сообщение отправлено');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при отправке сообщения в чат`,
        error?.stack,
        this.CONTEXT,
        { dto, error },
      );
      return errorResponse('Ошибка при отправке сообщения', error);
    }
  }

  /**
   * Пометить сообщения как прочитанные
   */
  async readMessages(dto: ReadMessagesDto): Promise<ApiResponse<boolean>> {
    try {
      const { chatId, userId, lastReadMessageId } = dto;

      this.logger.debug(
        `Пометка сообщений как прочитанных в чате ${chatId} для пользователя ${userId}`,
        this.CONTEXT,
        { lastReadMessageId },
      );

      // Проверяем существование чата
      const chatMetadata = await this.getChatMetadata(chatId);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Попытка пометить сообщения в несуществующем чате ${chatId}`,
          this.CONTEXT,
        );
        return errorResponse('Чат не найден');
      }

      const chat = chatMetadata.data;

      // Проверяем, является ли пользователь участником чата
      if (!chat.participants.includes(userId)) {
        this.logger.warn(
          `Пользователь ${userId} не является участником чата ${chatId}`,
          this.CONTEXT,
        );
        return errorResponse('Вы не являетесь участником этого чата');
      }

      // Обновляем статус прочтения
      const readStatusKey = `chat:${chatId}:read_status`;
      const readStatusResponse = await this.getReadStatus(chatId);

      if (!readStatusResponse.success || !readStatusResponse.data) {
        this.logger.debug(
          `Создаем новый статус прочтения для чата ${chatId}`,
          this.CONTEXT,
        );
        // Если статус прочтения не найден, создаем новый
        const newReadStatus = {
          [userId]: lastReadMessageId,
        };

        await this.redisService.setKey(
          readStatusKey,
          JSON.stringify(newReadStatus),
          this.CHAT_TTL,
        );
      } else {
        // Обновляем существующий статус прочтения
        const readStatus = readStatusResponse.data;
        readStatus[userId] = lastReadMessageId;

        await this.redisService.setKey(
          readStatusKey,
          JSON.stringify(readStatus),
          this.CHAT_TTL,
        );
      }

      // Продлеваем TTL для всех ключей, связанных с чатом
      await this.extendChatTTL(chatId);

      // Инвалидируем кеш превью для пользователя
      await this.invalidateChatsPreviewCache(userId);
      
      // Находим отправителя сообщения (для отправки уведомления)
      // Получаем сообщение по ID
      const messagesKey = `chat:${chatId}:messages`;
      const messageResponse = await this.redisService.getHashField(
        messagesKey,
        lastReadMessageId,
      );
      
      let senderId = null;
      if (messageResponse.success && messageResponse.data) {
        try {
          const message = JSON.parse(messageResponse.data);
          senderId = message.fromUser;
        } catch (e) {
          this.logger.warn(
            `Ошибка при парсинге сообщения ${lastReadMessageId}`,
            this.CONTEXT,
            { error: e }
          );
        }
      }
      
      // Если нашли отправителя, уведомляем его через Redis Pub/Sub
      if (senderId && senderId !== userId) {
        await this.redisPubSubService.publishMessageRead({
          chatId,
          userId,
          messageIds: [lastReadMessageId],
          timestamp: Date.now()
        });
      }

      this.logger.debug(
        `Статус прочтения для пользователя ${userId} в чате ${chatId} обновлен`,
        this.CONTEXT,
      );

      return successResponse(true, 'Статус прочтения обновлен');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при обновлении статуса прочтения`,
        error?.stack,
        this.CONTEXT,
        { dto, error },
      );
      return errorResponse('Ошибка при обновлении статуса прочтения', error);
    }
  }

  /**
   * Удаление чата с архивацией в S3
   */
  async delete(chatId: string): Promise<ApiResponse<boolean>> {
    try {
      this.logger.debug(`Удаление чата ${chatId}`, this.CONTEXT);

      // Проверяем существование чата
      const chatMetadata = await this.getChatMetadata(chatId);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Попытка удалить несуществующий чат ${chatId}`,
          this.CONTEXT,
        );
        return errorResponse('Чат не найден');
      }

      const chat = chatMetadata.data;

      // Сохраняем архив чата в облачное хранилище перед удалением
      const archiveSuccess = await this.archiveChatToStorage(chatId);
      if (!archiveSuccess) {
        this.logger.warn(
          `Не удалось архивировать чат ${chatId} перед удалением`,
          this.CONTEXT,
        );
      } else {
        this.logger.debug(
          `Чат ${chatId} успешно архивирован перед удалением`,
          this.CONTEXT,
        );
      }

      // Удаляем все ключи, связанные с чатом
      await Promise.all([
        this.redisService.deleteKey(`chat:${chatId}`),
        this.redisService.deleteKey(`chat:${chatId}:read_status`),
        this.redisService.deleteKey(`chat:${chatId}:messages`),
        this.redisService.deleteKey(`chat:${chatId}:order`),
      ]);

      // Удаляем чат из списков чатов пользователей
      const removePromises = chat.participants.map(userId =>
        this.removeChatFromUserList(userId, chatId),
      );
      await Promise.all(removePromises);

      // Инвалидируем кеш превью для всех участников
      const invalidatePromises = chat.participants.map(userId =>
        this.invalidateChatsPreviewCache(userId),
      );
      await Promise.all(invalidatePromises);
      
      // Отправляем уведомления об удалении чата через Redis Pub/Sub
      for (const userId of chat.participants) {
        await this.redisPubSubService.publish('chat:delete', {
          userId,
          chatId,
          timestamp: Date.now()
        });
      }

      this.logger.debug(`Чат ${chatId} успешно удален`, this.CONTEXT);

      return successResponse(true, 'Чат удален');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при удалении чата`,
        error?.stack,
        this.CONTEXT,
        { chatId, error },
      );
      return errorResponse('Ошибка при удалении чата', error);
    }
  }

  /**
   * Обработка статуса набора текста
   */
  async updateTypingStatus(dto: TypingStatusDto): Promise<ApiResponse<boolean>> {
    try {
      const { chatId, userId, isTyping } = dto;

      this.logger.debug(
        `Обновление статуса набора текста в чате ${chatId} для пользователя ${userId}`,
        this.CONTEXT,
        { isTyping }
      );

      // Проверяем существование чата
      const chatMetadata = await this.getChatMetadata(chatId);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Попытка обновить статус набора текста в несуществующем чате ${chatId}`,
          this.CONTEXT
        );
        return errorResponse('Чат не найден');
      }

      const chat = chatMetadata.data;

      // Проверяем, является ли пользователь участником чата
      if (!chat.participants.includes(userId)) {
        this.logger.warn(
          `Пользователь ${userId} не является участником чата ${chatId}`,
          this.CONTEXT
        );
        return errorResponse('Вы не являетесь участником этого чата');
      }

      // Находим получателя
      const recipientId = chat.participants.find(id => id !== userId);
      
      if (!recipientId) {
        this.logger.warn(
          `Не найден получатель для чата ${chatId}`,
          this.CONTEXT
        );
        return errorResponse('Получатель не найден');
      }

      // Отправляем уведомление через Redis Pub/Sub
      await this.redisPubSubService.publishTypingStatus({
        chatId,
        userId,
        isTyping,
        participants: chat.participants
      });

      return successResponse(true, 'Статус набора текста обновлен');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при обновлении статуса набора текста`,
        error?.stack,
        this.CONTEXT,
        { dto, error }
      );
      return errorResponse('Ошибка при обновлении статуса набора текста', error);
    }
  }

  /**
   * Отправка сообщения с медиафайлом
   */
  async sendMessageWithMedia(dto: SendMessageWithMediaDto): Promise<ApiResponse<ChatMsg>> {
    try {
      const { chatId, fromUser, text, media_type, media_url } = dto;

      this.logger.debug(
        `Отправка сообщения с медиафайлом в чат ${chatId} от пользователя ${fromUser}`,
        this.CONTEXT,
        { media_type }
      );

      // Проверяем существование чата
      const chatMetadata = await this.getChatMetadata(chatId);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Попытка отправить сообщение с медиафайлом в несуществующий чат ${chatId}`,
          this.CONTEXT
        );
        return errorResponse('Чат не найден');
      }

      const chat = chatMetadata.data;

      // Проверяем, является ли пользователь участником чата
      if (!chat.participants.includes(fromUser)) {
        this.logger.warn(
          `Пользователь ${fromUser} не является участником чата ${chatId}`,
          this.CONTEXT
        );
        return errorResponse('Вы не являетесь участником этого чата');
      }

      // Проверяем, не заблокирован ли пользователь
      const sender = await this.prismaService.user.findUnique({
        where: { telegramId: fromUser, status: { not: 'Blocked' } },
      });

      if (!sender) {
        this.logger.warn(
          `Отправитель ${fromUser} не найден или заблокирован`,
          this.CONTEXT
        );
        return errorResponse('Отправитель не найден или заблокирован');
      }

      // Создаем новое сообщение с медиафайлом
      const messageId = v4();
      const timestamp = Date.now();

      const message: ChatMsg = {
        id: messageId,
        chatId,
        fromUser,
        text,
        created_at: timestamp,
        updated_at: timestamp,
        is_read: false,
        media_type,
        media_url,
      };

      // Сохраняем сообщение
      const messagesKey = `chat:${chatId}:messages`;
      await this.redisService.setHashField(
        messagesKey,
        messageId,
        JSON.stringify(message)
      );

      // Обновляем порядок сообщений
      const orderKey = `chat:${chatId}:order`;
      await this.redisService.addToSortedSet(orderKey, timestamp, messageId);

      // Обновляем метаданные чата
      chat.last_message_id = messageId;

      // Если пользователь был в списке набирающих текст, удаляем его
      if (chat.typing && chat.typing.includes(fromUser)) {
        chat.typing = chat.typing.filter(id => id !== fromUser);
      }

      await this.redisService.setKey(
        `chat:${chatId}`,
        JSON.stringify(chat),
        this.CHAT_TTL
      );

      // Продлеваем TTL для всех ключей, связанных с чатом
      await this.extendChatTTL(chatId);

      // Инвалидируем кеш превью для обоих участников
      for (const userId of chat.participants) {
        await this.invalidateChatsPreviewCache(userId);
      }

      // Находим получателя сообщения
      const recipientId = chat.participants.find(id => id !== fromUser);

      // Отправляем уведомление через Redis Pub/Sub
      if (recipientId) {
        await this.redisPubSubService.publishNewMessage({
          chatId,
          messageId,
          senderId: fromUser,
          recipientId,
          text,
          timestamp,
          media_type,
          media_url
        });
      }

      this.logger.debug(
        `Сообщение ${messageId} с медиафайлом успешно отправлено в чат ${chatId}`,
        this.CONTEXT,
        { media_type }
      );

      return successResponse(message, 'Сообщение с медиафайлом отправлено');
    } catch (error: any) {
      this.logger.error(
        `Ошибка при отправке сообщения с медиафайлом`,
        error?.stack,
        this.CONTEXT,
        { dto, error }
      );
      return errorResponse('Ошибка при отправке сообщения с медиафайлом', error);
    }
  }

  /**
   * Архивация чата в S3
   */
  private async archiveChatToStorage(chatId: string): Promise<boolean> {
    try {
      this.logger.debug(`Архивирование чата ${chatId}`, this.CONTEXT);

      // Получаем все данные чата
      const [chatMetadata, chatMessages, readStatus] = await Promise.all([
        this.getChatMetadata(chatId),
        this.getChatMessages(chatId, 10000, 0), // Получаем все сообщения
        this.getReadStatus(chatId),
      ]);

      if (!chatMetadata.success || !chatMetadata.data) {
        this.logger.warn(
          `Не удалось получить метаданные чата ${chatId} для архивации`,
          this.CONTEXT,
        );
        return false;
      }

      const chat = chatMetadata.data;
      const messages = chatMessages.success ? chatMessages.data || [] : [];
      const readStatusData = readStatus.success ? readStatus.data : {};

      // Формируем архив
      const archiveData = {
        metadata: chat,
        messages: messages,
        readStatus: readStatusData,
        archivedAt: new Date().toISOString(),
      };

      // Сохраняем архив в S3
      const archiveKey = `chat_archives/${chatId}_${Date.now()}.json`;
      const archiveBuffer = Buffer.from(JSON.stringify(archiveData, null, 2));

      await this.storageService.uploadChatArchive(archiveKey, archiveBuffer);

      this.logger.debug(
        `Чат ${chatId} успешно архивирован в ${archiveKey}`,
        this.CONTEXT,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Ошибка при архивации чата`,
        error?.stack,
        this.CONTEXT,
        { chatId, error },
      );
      return false;
    }
  }

  /**
   * Обновление TTL для всех ключей, связанных с чатом
   */
  private async extendChatTTL(chatId: string): Promise<void> {
    try {
      const keys = [
        `chat:${chatId}`,
        `chat:${chatId}:read_status`,
        `chat:${chatId}:messages`,
        `chat:${chatId}:order`,
      ];

      const promises = keys.map(key =>
        this.redisService.expireKey(key, this.CHAT_TTL),
      );
      await Promise.all(promises);

      this.logger.debug(
        `TTL для чата ${chatId} продлен на ${this.CHAT_TTL} секунд`,
        this.CONTEXT,
      );
    } catch (error) {
      this.logger.warn(
        `Ошибка при продлении TTL для чата ${chatId}`,
        this.CONTEXT,
        { error },
      );
    }
  }

  /**
   * Поиск существующего чата между двумя пользователями
   */
  private async findExistingChat(
    user1: string,
    user2: string,
  ): Promise<string | null> {
    try {
      const userChatsKey = `user:${user1}:chats`;
      const userChatsResponse = await this.redisService.getKey(userChatsKey);

      if (!userChatsResponse.success || !userChatsResponse.data) {
        return null;
      }

      const chatIds = JSON.parse(userChatsResponse.data);

      if (!Array.isArray(chatIds) || chatIds.length === 0) {
        return null;
      }

      this.logger.debug(
        `Поиск существующего чата между пользователями ${user1} и ${user2}`,
        this.CONTEXT,
        { chatCount: chatIds.length },
      );

      // Получаем метаданные всех чатов в одном пакете
      const metadataPromises = chatIds.map(chatId =>
        this.getChatMetadata(chatId),
      );
      const metadataResults = await Promise.all(metadataPromises);

      // Ищем чат с обоими пользователями
      for (const result of metadataResults) {
        if (!result.success || !result.data) continue;

        const chat = result.data;

        // Если оба пользователя являются участниками чата
        if (
          chat.participants.includes(user1) &&
          chat.participants.includes(user2)
        ) {
          this.logger.debug(
            `Найден существующий чат ${chat.id} между пользователями ${user1} и ${user2}`,
            this.CONTEXT,
          );
          return chat.id;
        }
      }

      this.logger.debug(
        `Не найден существующий чат между пользователями ${user1} и ${user2}`,
        this.CONTEXT,
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `Ошибка при поиске существующего чата`,
        error?.stack,
        this.CONTEXT,
        { user1, user2, error },
      );
      return null;
    }
  }

  /**
   * Добавление чата в список чатов пользователя
   */
  private async addChatToUserList(
    userId: string,
    chatId: string,
  ): Promise<void> {
    try {
      const userChatsKey = `user:${userId}:chats`;
      const userChatsResponse = await this.redisService.getKey(userChatsKey);

      let chatIds = [];

      if (userChatsResponse.success && userChatsResponse.data) {
        try {
          chatIds = JSON.parse(userChatsResponse.data);

          if (!Array.isArray(chatIds)) {
            chatIds = [];
          }
        } catch (e) {
          this.logger.warn(
            `Ошибка при парсинге списка чатов пользователя ${userId}`,
            this.CONTEXT,
            { error: e },
          );
          chatIds = [];
        }
      }

      // Добавляем чат в список, если его там еще нет
      if (!chatIds.includes(chatId)) {
        chatIds.push(chatId);
        await this.redisService.setKey(
          userChatsKey,
          JSON.stringify(chatIds),
          this.CHAT_TTL,
        );

        this.logger.debug(
          `Чат ${chatId} добавлен в список чатов пользователя ${userId}`,
          this.CONTEXT,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Ошибка при добавлении чата в список пользователя`,
        error?.stack,
        this.CONTEXT,
        { userId, chatId, error },
      );
    }
  }

  /**
   * Удаление чата из списка чатов пользователя
   */
  private async removeChatFromUserList(
    userId: string,
    chatId: string,
  ): Promise<void> {
    try {
      const userChatsKey = `user:${userId}:chats`;
      const userChatsResponse = await this.redisService.getKey(userChatsKey);

      if (!userChatsResponse.success || !userChatsResponse.data) {
        return;
      }

      try {
        const chatIds = JSON.parse(userChatsResponse.data);

        if (!Array.isArray(chatIds)) {
          return;
        }

        // Удаляем чат из списка
        const updatedChatIds = chatIds.filter(id => id !== chatId);

        if (updatedChatIds.length === 0) {
          // Если список пуст, удаляем ключ
          await this.redisService.deleteKey(userChatsKey);
          this.logger.debug(
            `Удален пустой список чатов пользователя ${userId}`,
            this.CONTEXT,
          );
        } else {
          // Иначе обновляем список
          await this.redisService.setKey(
            userChatsKey,
            JSON.stringify(updatedChatIds),
            this.CHAT_TTL,
          );
          this.logger.debug(
            `Чат ${chatId} удален из списка чатов пользователя ${userId}`,
            this.CONTEXT,
          );
        }
      } catch (e: any) {
        this.logger.error(
          `Ошибка при парсинге списка чатов пользователя`,
          e?.stack,
          this.CONTEXT,
          { userId, error: e },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Ошибка при удалении чата из списка пользователя`,
        error?.stack,
        this.CONTEXT,
        { userId, chatId, error },
      );
    }
  }

  /**
   * Инвалидация кеша превью чатов пользователя
   */
  private async invalidateChatsPreviewCache(userId: string): Promise<void> {
    try {
      const previewCacheKey = `user:${userId}:chats_preview`;
      await this.redisService.deleteKey(previewCacheKey);
      this.logger.debug(
        `Кеш превью чатов для пользователя ${userId} инвалидирован`,
        this.CONTEXT,
      );
    } catch (error) {
      this.logger.warn(
        `Ошибка при инвалидации кеша превью чатов`,
        this.CONTEXT,
        { userId, error },
      );
    }
  }

  /**
   * Выполнение задачи очистки чатов с механизмом блокировки
   */
  private async runChatCleanupWithLock(): Promise<void> {
    // Пытаемся получить блокировку
    const lockId = v4();
    const lockResult = await this.redisService.redis.set(
      this.lockKey,
      lockId,
      'EX',
      this.lockDuration,
      'NX',
    );

    if (!lockResult) {
      this.logger.log(
        'Задача очистки чатов уже выполняется другим процессом',
        this.CONTEXT,
      );
      return;
    }

    try {
      this.logger.log('Начало задачи очистки устаревших чатов', this.CONTEXT);
      await this.cleanupExpiredChats();
    } finally {
      // Освобождаем блокировку, только если она всё ещё принадлежит нам
      try {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redisService.redis.eval(script, 1, this.lockKey, lockId);
        this.logger.debug('Блокировка очистки чатов освобождена', this.CONTEXT);
      } catch (error: any) {
        this.logger.error(
          'Ошибка при освобождении блокировки очистки чатов',
          error?.stack,
          this.CONTEXT,
          { error: error },
        );
      }
    }
  }

  /**
   * Очистка устаревших чатов
   */
  private async cleanupExpiredChats(): Promise<void> {
    try {
      // Получаем все ключи чатов
      const chatKeys = await this.redisService.redis.keys('chat:*:*');
      const metadataKeysSet = new Set<string>();

      // Извлекаем ID чатов из ключей
      for (const key of chatKeys) {
        const parts = key.split(':');
        if (parts.length >= 3) {
          metadataKeysSet.add(`chat:${parts[1]}`);
        }
      }

      const metadataKeys = Array.from(metadataKeysSet);
      this.logger.log(
        `Найдено ${metadataKeys.length} потенциальных чатов для проверки`,
        this.CONTEXT,
      );

      let archivedCount = 0;
      let errorCount = 0;

      for (const key of metadataKeys) {
        try {
          const chatId = key.split(':')[1];

          // Получаем метаданные чата
          const chatData = await this.redisService.getKey(key);

          if (!chatData.success || !chatData.data) {
            continue;
          }

          const chat: Chat = JSON.parse(chatData.data);
          const currentTime = Date.now();

          // Если чат старше 24 часов, архивируем и удаляем его
          if (currentTime - chat.created_at > this.CHAT_TTL * 1000) {
            this.logger.debug(
              `Чат ${chatId} устарел, подготовка к архивации`,
              this.CONTEXT,
              {
                age: (currentTime - chat.created_at) / 1000,
                participants: chat.participants,
              },
            );

            // Архивируем чат перед удалением
            const archived = await this.archiveChatToStorage(chatId);

            if (archived) {
              // Удаляем чат из Redis
              await this.delete(chatId);
              archivedCount++;
              this.logger.log(
                `Архивирован и удален устаревший чат: ${chatId}`,
                this.CONTEXT,
              );
            }
          }
        } catch (error: any) {
          errorCount++;
          this.logger.error(
            `Ошибка при проверке чата`,
            error?.stack,
            this.CONTEXT,
            { chatKey: key, error },
          );
        }
      }

      this.logger.log(
        `Завершена очистка чатов. Архивировано: ${archivedCount}, ошибок: ${errorCount}`,
        this.CONTEXT,
      );
    } catch (error: any) {
      this.logger.error(
        'Ошибка при очистке устаревших чатов',
        error?.stack,
        this.CONTEXT,
        { error },
      );
    }
  }
}