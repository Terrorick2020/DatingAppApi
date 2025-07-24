import {
    errorResponse,
    successResponse,
} from '@/common/helpers/api.response.helper'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '../common/logger/logger.service'
import { StorageService } from '../storage/storage.service'
import { CheckPsychologistDto } from './dto/check-psychologist.dto'
import { CreatePsychologistDto } from './dto/create-psychologist.dto'
import { DeletePsychologistDto } from './dto/delete-psychologist.dto'
import { FindPsychologistBySelectorDto } from './dto/find-psychologist-by-selector.dto'
import { FindPsychologistsDto } from './dto/find-psychologists.dto'
import { UpdatePsychologistDto } from './dto/update-psychologist.dto'
import type {
    CreatePsychologistResponse,
    Psychologist,
    PsychologistPreview,
    PsychologistsListResponse,
} from './psychologist.types'

@Injectable()
export class PsychologistService {
	private readonly CONTEXT = 'PsychologistService'

	constructor(
		private readonly prismaService: PrismaService,
		private readonly storageService: StorageService,
		private readonly logger: AppLogger
	) {}

	/**
	 * Создание нового психолога
	 */
	async create(dto: CreatePsychologistDto): Promise<ApiResponse<CreatePsychologistResponse>> {
		try {
			this.logger.debug(
				`Создание психолога с telegramId ${dto.telegramId}`,
				this.CONTEXT
			)

			// Проверяем, не существует ли уже психолог с таким telegramId
			const existingPsychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (existingPsychologist) {
				this.logger.warn(
					`Попытка создать психолога с существующим telegramId ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог с таким Telegram ID уже существует')
			}

			// Создаем нового психолога
			const psychologist = await this.prismaService.psychologist.create({
				data: {
					telegramId: dto.telegramId,
					name: dto.name,
					about: dto.about,
					status: 'Active',
				},
				include: {
					photos: true,
				},
			})

			this.logger.debug(
				`Психолог ${psychologist.id} успешно создан`,
				this.CONTEXT
			)

			return successResponse(
				{ psychologist, message: 'Психолог успешно зарегистрирован' },
				'Психолог создан'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при создании психолога', error)
		}
	}

	/**
	 * Получение списка психологов
	 */
	async findAll(dto: FindPsychologistsDto): Promise<ApiResponse<PsychologistsListResponse>> {
		try {
			const { search = '', limit = 10, offset = 0 } = dto

			this.logger.debug(
				`Поиск психологов: search="${search}", limit=${limit}, offset=${offset}`,
				this.CONTEXT
			)

			const where: any = {
				status: 'Active',
			}

			if (search) {
				where.OR = [
					{ name: { contains: search, mode: 'insensitive' } },
					{ about: { contains: search, mode: 'insensitive' } },
				]
			}

			const [psychologists, total] = await Promise.all([
				this.prismaService.psychologist.findMany({
					where,
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
					orderBy: { createdAt: 'desc' },
					take: limit,
					skip: offset,
				}),
				this.prismaService.psychologist.count({ where }),
			])

			const previews: PsychologistPreview[] = psychologists.map((psychologist) => ({
				id: psychologist.id,
				telegramId: psychologist.telegramId,
				name: psychologist.name,
				about: psychologist.about,
				photos: psychologist.photos.map((photo) => ({
					id: photo.id,
					key: photo.key,
					tempTgId: photo.tempTgId,
					telegramId: photo.telegramId,
				})),
			}))

			this.logger.debug(
				`Найдено психологов: ${psychologists.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ psychologists: previews, total },
				'Список психологов получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка психологов`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении списка психологов', error)
		}
	}

	/**
	 * Получение списка психологов, исключая тех, с которыми уже есть чат
	 */
	async findAllExcludingExistingChats(dto: FindPsychologistsDto & { userTelegramId: string }): Promise<ApiResponse<PsychologistsListResponse>> {
		try {
			const { search = '', limit = 10, offset = 0, userTelegramId } = dto

			this.logger.debug(
				`Поиск психологов (исключая существующие чаты): search="${search}", limit=${limit}, offset=${offset}, userTelegramId=${userTelegramId}`,
				this.CONTEXT
			)

			// Получаем ID психологов, с которыми уже есть чат
			const existingChats = await this.prismaService.chat.findMany({
				where: {
					OR: [
						{ user1TelegramId: userTelegramId },
						{ user2TelegramId: userTelegramId }
					],
					AND: [
						{
							OR: [
								{ user1TelegramId: { startsWith: 'psychologist_' } },
								{ user2TelegramId: { startsWith: 'psychologist_' } }
							]
						}
					]
				},
				select: {
					user1TelegramId: true,
					user2TelegramId: true
				}
			})

			// Извлекаем ID психологов из существующих чатов
			const existingPsychologistIds = existingChats.map(chat => {
				if (chat.user1TelegramId.startsWith('psychologist_')) {
					return chat.user1TelegramId.replace('psychologist_', '')
				}
				return chat.user2TelegramId.replace('psychologist_', '')
			})

			this.logger.debug(
				`Найдено существующих чатов с психологами: ${existingPsychologistIds.length}`,
				this.CONTEXT
			)

			const where: any = {
				status: 'Active',
				telegramId: {
					notIn: existingPsychologistIds
				}
			}

			if (search) {
				where.OR = [
					{ name: { contains: search, mode: 'insensitive' } },
					{ about: { contains: search, mode: 'insensitive' } },
				]
			}

			const [psychologists, total] = await Promise.all([
				this.prismaService.psychologist.findMany({
					where,
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
					orderBy: { createdAt: 'desc' },
					take: limit,
					skip: offset,
				}),
				this.prismaService.psychologist.count({ where }),
			])

			const previews: PsychologistPreview[] = psychologists.map((psychologist) => ({
				id: psychologist.id,
				telegramId: psychologist.telegramId,
				name: psychologist.name,
				about: psychologist.about,
				photos: psychologist.photos.map((photo) => ({
					id: photo.id,
					key: photo.key,
					tempTgId: photo.tempTgId,
					telegramId: photo.telegramId,
				})),
			}))

			this.logger.debug(
				`Найдено доступных психологов: ${psychologists.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ psychologists: previews, total },
				'Список доступных психологов получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка доступных психологов`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении списка доступных психологов', error)
		}
	}

	/**
	 * Получение психолога по ID
	 */
	async findById(id: number): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(`Получение психолога с ID ${id}`, this.CONTEXT)

			const psychologist = await this.prismaService.psychologist.findUnique({
				where: { id },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.warn(`Психолог с ID ${id} не найден`, this.CONTEXT)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка получить неактивного психолога с ID ${id}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(`Психолог ${id} успешно получен`, this.CONTEXT)

			return successResponse(psychologist, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении психолога`,
				error?.stack,
				this.CONTEXT,
				{ id, error }
			)
			return errorResponse('Ошибка при получении психолога', error)
		}
	}

	/**
	 * Получение психолога по Telegram ID
	 */
	async findByTelegramId(telegramId: string): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Получение психолога с telegramId ${telegramId}`,
				this.CONTEXT
			)

			const psychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.warn(
					`Психолог с telegramId ${telegramId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			this.logger.debug(
				`Психолог с telegramId ${telegramId} успешно получен`,
				this.CONTEXT
			)

			return successResponse(psychologist, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении психолога по telegramId`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse('Ошибка при получении психолога', error)
		}
	}

	/**
	 * Обновление профиля психолога
	 */
	async update(
		telegramId: string,
		dto: UpdatePsychologistDto
	): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Обновление профиля психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование психолога
			const existingPsychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId },
			})

			if (!existingPsychologist) {
				this.logger.warn(
					`Попытка обновить несуществующего психолога ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Обновляем данные
			const updateData: any = {}
			if (dto.name !== undefined) updateData.name = dto.name
			if (dto.about !== undefined) updateData.about = dto.about

			const psychologist = await this.prismaService.psychologist.update({
				where: { telegramId },
				data: updateData,
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			this.logger.debug(
				`Профиль психолога ${telegramId} успешно обновлен`,
				this.CONTEXT
			)

			return successResponse(psychologist, 'Профиль обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении профиля психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, dto, error }
			)
			return errorResponse('Ошибка при обновлении профиля', error)
		}
	}

	/**
	 * Проверка существования психолога
	 */
	async exists(telegramId: string): Promise<boolean> {
		try {
			const psychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId },
				select: { id: true },
			})
			return !!psychologist
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке существования психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return false
		}
	}

	/**
	 * Проверка регистрации психолога
	 */
	async check(dto: CheckPsychologistDto): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Проверка регистрации психолога ${dto.telegramId}`,
				this.CONTEXT
			)

			const psychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.debug(
					`Психолог ${dto.telegramId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка входа неактивного психолога ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(
				`Психолог ${dto.telegramId} успешно авторизован`,
				this.CONTEXT
			)

			return successResponse(psychologist, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при проверке психолога', error)
		}
	}

	/**
	 * Удаление психолога
	 */
	async delete(dto: DeletePsychologistDto): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(
				`Удаление психолога ${dto.telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование психолога
			const psychologist = await this.prismaService.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (!psychologist) {
				this.logger.warn(
					`Попытка удалить несуществующего психолога ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Удаляем психолога
			await this.prismaService.psychologist.delete({
				where: { telegramId: dto.telegramId },
			})

			this.logger.debug(
				`Психолог ${dto.telegramId} успешно удален`,
				this.CONTEXT
			)

			return successResponse(true, 'Психолог удален')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при удалении психолога', error)
		}
	}

	/**
	 * Поиск психолога по селектору (ID или имя)
	 */
	async findBySelector(dto: FindPsychologistBySelectorDto): Promise<ApiResponse<Psychologist>> {
		try {
			const { selector } = dto

			this.logger.debug(
				`Поиск психолога по селектору: ${selector}`,
				this.CONTEXT
			)

			// Проверяем, является ли селектор числом (ID)
			const isNumeric = !isNaN(Number(selector))

			let psychologist: any = null

			if (isNumeric) {
				// Поиск по ID
				psychologist = await this.prismaService.psychologist.findUnique({
					where: { id: parseInt(selector) },
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
				})
			} else {
				// Поиск по имени (точное совпадение)
				psychologist = await this.prismaService.psychologist.findFirst({
					where: { 
						name: selector,
						status: 'Active'
					},
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
				})
			}

			if (!psychologist) {
				this.logger.debug(
					`Психолог с селектором ${selector} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка получить неактивного психолога с селектором ${selector}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(
				`Психолог с селектором ${selector} успешно найден`,
				this.CONTEXT
			)

			return successResponse(psychologist, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске психолога по селектору`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при поиске психолога', error)
		}
	}
} 