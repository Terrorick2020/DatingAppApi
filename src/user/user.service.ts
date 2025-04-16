import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import {
	successResponse,
	errorResponse,
} from '../common/helpers/api.response.helper'
import { PublicUserDto } from './dto/public-user.dto'
import { StorageService } from '../storage/storage.service'

@Injectable()
export class UserService {
	constructor(
		private prisma: PrismaService,
		private readonly storageService: StorageService
	) {}

	async create(dto: CreateUserDto) {
		try {
			const user = await this.prisma.user.create({
				data: dto,
				include: { photos: true },
			})

			return successResponse(user, 'Пользователь успешно создан')
		} catch (error) {
			return errorResponse('Ошибка при создании пользователя', error)
		}
	}

	async findAll() {
		try {
			const users = await this.prisma.user.findMany({
				include: { photos: true },
			})
			return successResponse(users)
		} catch (error) {
			return errorResponse('Ошибка при получении пользователей', error)
		}
	}

	async findByTelegramId(telegramId: string) {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				include: { photos: true },
			})
			return successResponse(user)
		} catch (error) {
			return errorResponse('Ошибка при получении по Telegram ID', error)
		}
	}

	async update(id: number, dto: UpdateUserDto) {
		try {
			const user = await this.prisma.user.update({
				where: { id },
				data: dto,
			})
			return successResponse(user, 'Профиль обновлён')
		} catch (error) {
			return errorResponse('Ошибка при обновлении пользователя', error)
		}
	}

	async remove(id: number) {
		try {
			await this.prisma.user.delete({ where: { id } })
			return successResponse(null, 'Пользователь удалён')
		} catch (error) {
			return errorResponse('Ошибка при удалении пользователя', error)
		}
	}

	async checkTgID(telegramId: string) {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
			})
			return user ? user.status : 'None'
		} catch (error) {
			return errorResponse('Ошибка при проверке Telegram ID:', error)
		}
	}

	async savePhotos(userId: number, photoKeys: string[]) {
		try {
			const photos = photoKeys.map(key => ({
				key,
				userId,
			}))

			await this.prisma.photo.createMany({ data: photos })
			return successResponse(null, 'Фотографии сохранены')
		} catch (error) {
			return errorResponse('Ошибка при сохранении фото', error)
		}
	}

	async getPublicProfile(telegramId: string) {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId: telegramId },
				include: { photos: true },
			})

			if (!user) return errorResponse('Пользователь не найден')
 
			const photoUrls = await Promise.all(
				user.photos.map(p => this.storageService.getPresignedUrl(p.key))
			)

			const publicProfile: PublicUserDto = {
				id: user.id,
				name: user.name,
				town: user.town,
				age: user.age,
				sex: user.sex,
				photos: photoUrls,
			}

			return successResponse(publicProfile, 'Публичный профиль получен')
		} catch (error) {
			return errorResponse('Ошибка при получении публичного профиля:', error)
		}
	}
}
