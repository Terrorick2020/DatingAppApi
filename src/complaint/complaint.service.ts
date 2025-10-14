import {
	errorResponse,
	successResponse,
} from '@/common/helpers/api.response.helper'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as cron from 'node-cron'
import { v4 } from 'uuid'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisService } from '../redis/redis.service'
import {
	ComplaintResponse,
	ComplaintStatus,
	ComplaintType,
	ComplaintWithUsers,
} from './complaint.types'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { GetComplaintsDto } from './dto/get-complaints.dto'
import { UpdateComplaintDto } from './dto/update-complaint.dto'
import { scanKeys } from './redis-scan.util'

@Injectable()
export class ComplaintService implements OnModuleInit, OnModuleDestroy {
	private readonly COMPLAINT_TTL = 86400 * 60 // 60 дней в секундах
	private readonly CACHE_TTL = 1800 // 30 минут в секундах для кэша
	private cleanupTask: cron.ScheduledTask | null = null
	private readonly lockKey = 'complaint_cleanup_lock'
	private readonly lockDuration = 600 // 10 минут блокировки для очистки
	private readonly CONTEXT = 'ComplaintService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly redisService: RedisService,
		private readonly logger: AppLogger,
		private readonly redisPubSub: RedisPubSubService
	) {}

	/**
	 * Инициализация сервиса жалоб
	 */
	async onModuleInit() {
		// Задача очистки старых жалоб (архивация)
		this.cleanupTask = cron.schedule('0 0 * * *', async () => {
			try {
				await this.runComplaintCleanupWithLock()
			} catch (error: any) {
				this.logger.error(
					'Ошибка при очистке устаревших жалоб',
					error?.stack,
					this.CONTEXT,
					{ error }
				)
			}
		})
		this.logger.log('Задача очистки жалоб инициализирована', this.CONTEXT)
	}

	/**
	 * Корректное завершение работы сервиса
	 */
	onModuleDestroy() {
		if (this.cleanupTask) {
			this.cleanupTask.stop()
			this.logger.log('Задача очистки жалоб остановлена', this.CONTEXT)
		}
	}

	/**
	 * Создание новой жалобы
	 */
	async createComplaint(
		createDto: CreateComplaintDto
	): Promise<ApiResponse<ComplaintResponse>> {
		try {
			const {
				fromUserId,
				reportedUserId,
				type,
				description,
				reportedContentId,
			} = createDto

			this.logger.debug(
				`Создание жалобы от ${fromUserId} на ${reportedUserId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователей
			const [reporter, reported] = await Promise.all([
				this.prisma.user.findUnique({
					where: { telegramId: fromUserId, status: { not: 'Blocked' } },
					select: { telegramId: true },
				}),
				this.prisma.user.findUnique({
					where: reportedUserId
						? { telegramId: reportedUserId }
						: (undefined as any),
					select: { telegramId: true },
				}),
			])

			if (!reporter) {
				this.logger.warn(
					`Отправитель жалобы ${fromUserId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			if (!reported && type !== ('support, question' as any)) {
				this.logger.warn(
					`Пользователь ${reportedUserId}, на которого жалуются, не найден`,
					this.CONTEXT
				)
				return errorResponse(
					'Пользователь, на которого вы жалуетесь, не найден'
				)
			}

			// Проверяем, не подавал ли уже пользователь жалобу на этого пользователя
			const existingComplaint = reportedUserId
				? await this.prisma.complaint.findFirst({
						where: {
							fromUserId,
							toUserId: reportedUserId,
						},
					})
				: null

			if (existingComplaint) {
				this.logger.debug(
					`Жалоба от ${fromUserId} на ${reportedUserId} уже существует`,
					this.CONTEXT
				)
				return errorResponse('Вы уже подавали жалобу на этого пользователя')
			}

			// Находим или создаем причину жалобы
			let reasonId: number

			try {
				const reason = await this.prisma.complaintReason.findFirst({
					where: { value: type },
				})

				if (reason) {
					reasonId = reason.id
				} else {
					// Если причины нет, создаем новую (для типа OTHER)
					const newReason = await this.prisma.complaintReason.create({
						data: {
							id: Math.floor(Math.random() * 1000) + 100, // Генерируем случайный ID
							value: type,
							label: type, // Используем тип как метку
						},
					})
					reasonId = newReason.id
				}
			} catch (error: any) {
				this.logger.error(
					`Ошибка при поиске/создании причины жалобы`,
					error?.stack,
					this.CONTEXT,
					{ type, error }
				)
				return errorResponse('Ошибка при обработке причины жалобы')
			}

			// Создаем новую жалобу
			const complaint = await this.prisma.complaint.create({
				data: {
					reasonId,
					fromUserId,
					toUserId: reportedUserId || fromUserId,
				},
			})

			const [globType, targetType] = type.split(', ')

			const [globComplRes, targetComplRes] = await Promise.all([
				this.prisma.complaintGlobVars.findUnique({
					where: { value: globType },
				}),
				this.prisma.complaintDescVars.findUnique({
					where: { value: targetType },
				}),
			])

			// Сохраняем дополнительные данные в Redis
			const complaintKey = `complaint:${complaint.id}`
			const timestamp = Date.now()

			await this.redisService.setKey(
				complaintKey,
				JSON.stringify({
					id: complaint.id,
					status: ComplaintStatus.PENDING,
					type,
					description,
					reportedContentId,
					createdAt: timestamp,
					fromUserId,
					reportedUserId,
					globComplRes: globComplRes || '',
					targetComplRes: targetComplRes || '',
				}),
				this.COMPLAINT_TTL
			)

			// Инвалидируем кэш жалоб
			await this.invalidateComplaintsCache(fromUserId)
			if (reportedUserId) await this.invalidateComplaintsCache(reportedUserId)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publishComplaintUpdate({
				id: complaint.id.toString(),
				fromUserId,
				reportedUserId: reportedUserId || fromUserId,
				status: ComplaintStatus.PENDING,
				timestamp,
			})

			// Получаем список админов для отправки уведомлений
			const admins = await this.prisma.user.findMany({
				where: { role: 'Admin' },
				select: { telegramId: true },
			})

			// Публикуем событие новой жалобы для админов через Redis Pub/Sub
			for (const admin of admins) {
				await this.redisPubSub.publish('complaint:new:admin', {
					adminId: admin.telegramId,
					complaintId: complaint.id.toString(),
					fromUserId,
					reportedUserId,
					type,
					status: ComplaintStatus.PENDING,
					timestamp,
				})
			}

			this.logger.debug(`Жалоба #${complaint.id} успешно создана`, this.CONTEXT)

			return successResponse(
				{
					id: complaint.id.toString(),
					status: ComplaintStatus.PENDING,
					type: type as ComplaintType,
					createdAt: timestamp,
				},
				'Жалоба успешно создана'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании жалобы`,
				error?.stack,
				this.CONTEXT,
				{ dto: createDto, error }
			)
			return errorResponse('Ошибка при создании жалобы', error)
		}
	}

	/**
	 * Обновление статуса жалобы
	 */
	async updateComplaint(
		updateDto: UpdateComplaintDto
	): Promise<ApiResponse<any>> {
		try {
			const { complaintId, status, resolutionNotes, telegramId } = updateDto
			this.logger.debug(
				`Обновление статуса жалобы #${complaintId} на ${status}`,
				this.CONTEXT
			)

			// Проверяем, что пользователь является админом
			const admin = await this.prisma.user.findUnique({
				where: { telegramId, role: 'Admin' },
				select: { telegramId: true },
			})

			if (!admin) {
				this.logger.warn(
					`Неадминистратор ${telegramId} пытается обновить жалобу`,
					this.CONTEXT
				)
				return errorResponse(
					'Только администраторы могут обновлять статус жалоб'
				)
			}

			// Проверяем существование жалобы
			const complaint = await this.prisma.complaint.findUnique({
				where: { id: parseInt(complaintId) },
				include: {
					fromUser: { select: { telegramId: true } },
					toUser: { select: { telegramId: true } },
				},
			})

			if (!complaint) {
				this.logger.warn(`Жалоба #${complaintId} не найдена`, this.CONTEXT)
				return errorResponse('Жалоба не найдена')
			}

			// Получаем текущие данные жалобы из Redis
			const complaintKey = `complaint:${complaintId}`
			const complaintDataResponse = await this.redisService.getKey(complaintKey)

			let complaintData: any = {
				status: ComplaintStatus.PENDING,
			}

			if (complaintDataResponse.success && complaintDataResponse.data) {
				try {
					complaintData = JSON.parse(complaintDataResponse.data)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге данных жалобы #${complaintId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Обновляем данные жалобы
			const timestamp = Date.now()

			complaintData.status = status
			complaintData.updatedAt = timestamp
			complaintData.fromUserId = complaint.fromUser.telegramId
			complaintData.reportedUserId = complaint.toUser.telegramId

			if (resolutionNotes) {
				complaintData.resolutionNotes = resolutionNotes
			}

			// Сохраняем обновленные данные в Redis
			await this.redisService.setKey(
				complaintKey,
				JSON.stringify(complaintData),
				this.COMPLAINT_TTL
			)

			// Инвалидируем кэш жалоб
			await this.invalidateComplaintsCache(complaint.fromUser.telegramId)
			await this.invalidateComplaintsCache(complaint.toUser.telegramId)
			await this.prisma.complaint.update({
				where: { id: parseInt(complaintId) },
				data: { status: ComplaintStatus.RESOLVED },
			})

			// Подготавливаем данные для ответа и уведомлений
			const responseData = {
				id: complaintId,
				status,
				updatedAt: timestamp,
				resolutionNotes: complaintData.resolutionNotes,
				fromUserId: complaint.fromUser.telegramId,
				reportedUserId: complaint.toUser.telegramId,
			}

			// Отправляем уведомление через Redis Pub/Sub для WebSocket
			await this.redisPubSub.publishComplaintUpdate({
				id: complaintId,
				fromUserId: complaint.fromUser.telegramId,
				reportedUserId: complaint.toUser.telegramId,
				status,
				timestamp,
			})

			// Если это обращение в поддержку — уведомим пользователя через бота резолюцией
			if (
				complaintData.type === 'support, question' &&
				complaint.fromUser?.telegramId &&
				resolutionNotes
			) {
				await this.redisPubSub.publishBotNotify({
					telegramId: complaint.fromUser.telegramId,
					text: `Ответ по обращению #${complaintId}: ${resolutionNotes}`,
				})
			}

			this.logger.debug(
				`Статус жалобы #${complaintId} успешно обновлен на ${status}`,
				this.CONTEXT
			)

			return successResponse(responseData, 'Статус жалобы успешно обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении жалобы`,
				error?.stack,
				this.CONTEXT,
				{ dto: updateDto, error }
			)
			return errorResponse('Ошибка при обновлении жалобы', error)
		}
	}

	/**
	 * Получение жалоб
	 */
	async getComplaints(
		getDto: GetComplaintsDto
	): Promise<ApiResponse<ComplaintWithUsers[]>> {
		try {
			const { telegramId, type, status } = getDto
			this.logger.debug(
				`Получение жалоб типа ${type}, статуса ${status} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				select: { telegramId: true, role: true },
			})

			if (!user) {
				this.logger.warn(`Пользователь ${telegramId} не найден`, this.CONTEXT)
				return errorResponse('Пользователь не найден')
			}

			// Для жалоб "admin" пользователь должен быть админом
			if (type === 'admin' && user.role !== 'Admin') {
				this.logger.warn(
					`Неадминистратор ${telegramId} пытается получить админские жалобы`,
					this.CONTEXT
				)
				return errorResponse('Недостаточно прав для просмотра этих жалоб')
			}

			// Проверяем кэш
			const cacheKey = `user:${telegramId}:complaints:${type}`
			const cachedResponse = await this.redisService.getKey(cacheKey)

			if (cachedResponse.success && cachedResponse.data) {
				try {
					const allComplaints = JSON.parse(cachedResponse.data)

					const filteredComplaints = allComplaints.filter(
						(complaint: any) => complaint.status === status
					)

					this.logger.debug(
						`Получены ${filteredComplaints.length} жалоб(ы) со статусом UNDER_REVIEW для пользователя ${telegramId}`,
						this.CONTEXT
					)

					return successResponse(filteredComplaints, 'Жалобы получены из кэша')
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге кэша жалоб для пользователя ${telegramId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Определяем условия для запроса жалоб
			let prismaWhere: any = {}

			switch (type) {
				case 'sent':
					prismaWhere = { fromUserId: telegramId, status: status }
					break
				case 'received':
					prismaWhere = { toUserId: telegramId, status: status }
					break
				case 'admin':
					// Для админов - все жалобы
					break
				default:
					return errorResponse('Неизвестный тип запроса жалоб')
			}
			// Получаем жалобы из базы данных
			const complaints = await this.prisma.complaint.findMany({
				where: prismaWhere,
				include: {
					reason: {
						select: { value: true, label: true },
					},
					fromUser: {
						select: {
							telegramId: true,
							name: true,
							photos: { take: 1, select: { key: true } },
						},
					},
					toUser: {
						select: {
							telegramId: true,
							name: true,
							photos: { take: 1, select: { key: true } },
						},
					},
				},
				orderBy: { createdAt: 'desc' },
			})

			// Получаем дополнительные данные из Redis
			const enrichedComplaints: ComplaintWithUsers[] = await Promise.all(
				complaints.map(async complaint => {
					const complaintKey = `complaint:${complaint.id}`
					const complaintDataResponse =
						await this.redisService.getKey(complaintKey)

					let complaintData: any = {
						status: ComplaintStatus.PENDING,
					}

					if (complaintDataResponse.success && complaintDataResponse.data) {
						try {
							complaintData = JSON.parse(complaintDataResponse.data)
						} catch (e) {
							// Если ошибка парсинга, используем базовые данные
						}
					}

					const [globType, targetType] = complaint.reason.value.split(', ')

					const [globComplRes, targetComplRes] = await Promise.all([
						this.prisma.complaintGlobVars.findUnique({
							where: { value: globType },
						}),
						this.prisma.complaintDescVars.findUnique({
							where: { value: targetType },
						}),
					])

					return {
						id: complaint.id.toString(),
						fromUser: {
							telegramId: complaint.fromUser.telegramId,
							name: complaint.fromUser.name,
							avatar: complaint.fromUser.photos[0]?.key || '',
						},
						reportedUser: {
							telegramId: complaint.toUser.telegramId,
							name: complaint.toUser.name,
							avatar: complaint.toUser.photos[0]?.key || '',
						},
						type: complaint.reason.value as ComplaintType,
						status: complaintData.status || ComplaintStatus.PENDING,
						description: complaintData.description || '',
						reportedContentId: complaintData.reportedContentId,
						createdAt: complaint.createdAt.getTime(),
						updatedAt: complaintData.updatedAt,
						resolutionNotes: complaintData.resolutionNotes,
						globComplRes: globComplRes || '',
						targetComplRes: targetComplRes || '',
					}
				})
			)

			// Кэшируем результат
			await this.redisService.setKey(
				cacheKey,
				JSON.stringify(enrichedComplaints),
				this.CACHE_TTL
			)

			this.logger.debug(
				`Получено ${enrichedComplaints.length} жалоб типа ${type} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(enrichedComplaints, 'Жалобы успешно получены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении жалоб`,
				error?.stack,
				this.CONTEXT,
				{ dto: getDto, error }
			)
			return errorResponse('Ошибка при получении жалоб', error)
		}
	}

	/**
	 * Получение статистики жалоб для админов
	 */
	async getComplaintStats(adminId: string): Promise<ApiResponse<any>> {
		try {
			this.logger.debug(
				`Получение статистики жалоб для админа ${adminId}`,
				this.CONTEXT
			)

			// Проверяем, что пользователь является админом
			const admin = await this.prisma.user.findUnique({
				where: { telegramId: adminId, role: 'Admin' },
				select: { telegramId: true },
			})

			if (!admin) {
				this.logger.warn(
					`Неадминистратор ${adminId} пытается получить статистику жалоб`,
					this.CONTEXT
				)
				return errorResponse('Недостаточно прав для просмотра статистики жалоб')
			}

			// Проверяем кэш
			const cacheKey = `admin:complaints:stats`
			const cachedResponse = await this.redisService.getKey(cacheKey)

			if (cachedResponse.success && cachedResponse.data) {
				try {
					const cachedStats = JSON.parse(cachedResponse.data)
					this.logger.debug(
						`Получены кэшированные статистики жалоб`,
						this.CONTEXT
					)
					return successResponse(
						cachedStats,
						'Статистика жалоб получена из кэша'
					)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге кэша статистики жалоб`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Получаем общее количество жалоб
			const totalCount = await this.prisma.complaint.count()

			// Получаем количество жалоб по типам
			const reasonStats = await this.prisma.complaintReason.findMany({
				select: {
					value: true,
					label: true,
					_count: {
						select: { complaints: true },
					},
				},
			})

			// Получаем статус для каждой жалобы из Redis
			const complaintKeys = await this.redisService.redis.keys('complaint:*')

			// Подсчитываем количество жалоб для каждого статуса
			const statusCounts = {
				[ComplaintStatus.PENDING]: 0,
				[ComplaintStatus.UNDER_REVIEW]: 0,
				[ComplaintStatus.RESOLVED]: 0,
				[ComplaintStatus.REJECTED]: 0,
			}

			// Получаем данные о статусах из Redis
			await Promise.all(
				complaintKeys.map(async key => {
					const complaintDataResponse = await this.redisService.getKey(key)
					if (complaintDataResponse.success && complaintDataResponse.data) {
						try {
							const complaintData = JSON.parse(complaintDataResponse.data)

							// Проверяем, что статус является допустимым ключом для statusCounts
							if (complaintData.status) {
								const status = complaintData.status as keyof typeof statusCounts
								if (status in statusCounts) {
									statusCounts[status]++
								}
							}
						} catch (e) {
							// Игнорируем ошибки парсинга
						}
					}
				})
			)

			// Преобразуем результаты
			const stats = {
				total: totalCount,
				byType: reasonStats.map(reason => ({
					type: reason.value,
					label: reason.label,
					count: reason._count.complaints,
				})),
				byStatus: Object.entries(statusCounts).map(([status, count]) => ({
					status,
					count,
				})),
			}

			// Кэшируем результат
			await this.redisService.setKey(
				cacheKey,
				JSON.stringify(stats),
				this.CACHE_TTL
			)

			this.logger.debug(
				`Статистика жалоб успешно получена: всего ${totalCount} жалоб`,
				this.CONTEXT
			)

			return successResponse(stats, 'Статистика жалоб успешно получена')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении статистики жалоб`,
				error?.stack,
				this.CONTEXT,
				{ adminId, error }
			)
			return errorResponse('Ошибка при получении статистики жалоб', error)
		}
	}

	/**
	 * Инвалидация кэша жалоб пользователя
	 */
	private async invalidateComplaintsCache(userId: string): Promise<void> {
		try {
			const cacheKeys = [
				`user:${userId}:complaints:sent`,
				`user:${userId}:complaints:received`,
				`admin:complaints:stats`,
			]

			for (const key of cacheKeys) {
				await this.redisService.deleteKey(key)
			}

			this.logger.debug(
				`Кэш жалоб для пользователя ${userId} инвалидирован`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(`Ошибка при инвалидации кэша жалоб`, this.CONTEXT, {
				userId,
				error,
			})
		}
	}

	/**
	 * Выполнение задачи очистки жалоб с механизмом блокировки
	 */
	private async runComplaintCleanupWithLock(): Promise<void> {
		// Пытаемся получить блокировку
		const lockId = v4()
		const lockResult = await this.redisService.redis.set(
			this.lockKey,
			lockId,
			'EX',
			this.lockDuration,
			'NX'
		)

		if (!lockResult) {
			this.logger.log(
				'Задача очистки жалоб уже выполняется другим процессом',
				this.CONTEXT
			)
			return
		}

		try {
			this.logger.log('Начало задачи очистки устаревших жалоб', this.CONTEXT)

			// Архивация старых разрешенных/отклоненных жалоб
			const complaintKeys = await this.redisService.redis.keys('complaint:*')

			let archivedCount = 0
			let errorCount = 0
			const currentTime = Date.now()
			const maxAge = 180 * 24 * 60 * 60 * 1000 // 180 дней в мс

			for (const key of complaintKeys) {
				try {
					const complaintData = await this.redisService.getKey(key)

					if (complaintData.success && complaintData.data) {
						const complaint = JSON.parse(complaintData.data)

						// Проверяем возраст и статус жалобы
						if (
							(complaint.status === ComplaintStatus.RESOLVED ||
								complaint.status === ComplaintStatus.REJECTED) &&
							complaint.updatedAt &&
							currentTime - complaint.updatedAt > maxAge
						) {
							// Архивируем жалобу
							await this.archiveComplaint(complaint)

							// Удаляем данные из Redis
							await this.redisService.deleteKey(key)

							archivedCount++
						}
					}
				} catch (error) {
					errorCount++
					this.logger.error(
						`Ошибка при обработке жалобы ${key}`,
						(error as any)?.stack,
						this.CONTEXT,
						{ error }
					)
				}
			}

			this.logger.log(
				`Очистка жалоб завершена. Архивировано: ${archivedCount}, ошибок: ${errorCount}`,
				this.CONTEXT
			)
		} finally {
			// Освобождаем блокировку
			try {
				const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `
				await this.redisService.redis.eval(script, 1, this.lockKey, lockId)
				this.logger.debug('Блокировка очистки жалоб освобождена', this.CONTEXT)
			} catch (error: any) {
				this.logger.error(
					'Ошибка при освобождении блокировки очистки жалоб',
					error?.stack,
					this.CONTEXT,
					{ error: error }
				)
			}
		}
	}

	/**
	 * Архивация жалобы
	 */
	private async archiveComplaint(complaintData: any): Promise<void> {
		// Здесь можно реализовать логику архивации, например,
		// сохранение в S3 или отдельную таблицу архива
		this.logger.debug(`Архивация жалобы #${complaintData.id}`, this.CONTEXT)

		// Для примера, просто логируем событие
		this.logger.log(
			`Жалоба #${complaintData.id} архивирована. Статус: ${complaintData.status}`,
			this.CONTEXT
		)
	}

	async getComplaintsWithStatus(
		getDto: GetComplaintsDto
	): Promise<ApiResponse<ComplaintWithUsers[]>> {
		const { telegramId, type } = getDto

		this.logger.debug(
			`Получение НЕРАССМОТРЕННЫХ жалоб типа ${type} для пользователя ${telegramId}`,
			this.CONTEXT
		)

		const user = await this.prisma.user.findUnique({
			where: { telegramId },
			select: { telegramId: true, role: true },
		})

		if (!user) {
			this.logger.warn(`Пользователь ${telegramId} не найден`, this.CONTEXT)
			return errorResponse('Пользователь не найден')
		}

		if (type === 'admin' && user.role !== 'Admin') {
			this.logger.warn(
				`Неадмин ${telegramId} запрашивает админ-жалобы`,
				this.CONTEXT
			)
			return errorResponse('Недостаточно прав')
		}

		// Получаем все ключи жалоб
		const complaintKeys = await scanKeys(this.redisService, 'complaint:*')

		const complaints: ComplaintWithUsers[] = []

		for (const key of complaintKeys) {
			const data = await this.redisService.getKey(key)
			if (!data.success || !data.data) continue

			try {
				const complaint = JSON.parse(data.data)

				if (complaint.status !== 'PENDING') continue

				// Жалобы для админа — все, для обычного пользователя — только связанные
				if (
					type === 'admin' ||
					complaint.fromUserId === telegramId ||
					complaint.reportedUserId === telegramId
				) {
					complaints.push(complaint)
				}
			} catch (e) {
				this.logger.warn(`Неверные данные в ${key}`, this.CONTEXT, { error: e })
			}
		}

		this.logger.debug(
			`Найдено ${complaints.length} жалоб со статусом PENDING для ${telegramId}`,
			this.CONTEXT
		)

		return successResponse(complaints, 'Жалобы успешно получены')
	}
}
