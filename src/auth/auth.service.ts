import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { UserService } from '../user/user.service'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UploadPhotoInternalDto } from './dto/upload-photo-internal.dto'
import { CheckAuthDto } from './dto/check-auth.dto'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class AuthService {
	constructor(
		private prisma: PrismaService,
		private userService: UserService
	) {}

	async check(createAuthDto: CheckAuthDto) {
		const telegramId = createAuthDto.telegramId
		try {
			const status = await this.userService.checkTgID(telegramId)
			if (status === 'None') {
				return successResponse(status, 'Пользователь не зарегистрирован')
			}
			return successResponse(status, 'Пользователь найден')
		} catch (error) {
			return errorResponse('Ошибка при проверке пользователя:', error)
		}
	}

	async uploadPhoto(dto: UploadPhotoInternalDto) {
		const photo = await this.prisma.photo.create({
			data: {
				key: dto.key,
				tempTgId: dto.telegramId,
			},
		})
		return successResponse({ photoId: photo.id }, 'Фото временно сохранено')
	}

	async register(dto: CreateAuthDto) {
		try {
			return await this.prisma.$transaction(async tx => {
				const {
					telegramId,
					photoIds,
					invitedByReferralCode,
					interestId,
					...userData
				} = dto

				const existingUser = await tx.user.findUnique({
					where: { telegramId },
				})
				if (existingUser) {
					return errorResponse('Пользователь уже существует')
				}

				const photos = await tx.photo.findMany({
					where: { id: { in: photoIds } },
				})
				if (photos.length !== photoIds.length) {
					return errorResponse('Некоторые фотографии не найдены в базе данных')
				}

				let invitedById: string | undefined = undefined
				if (invitedByReferralCode) {
					const inviter = await tx.user.findUnique({
						where: { referralCode: invitedByReferralCode },
					})
					if (inviter) {
						invitedById = inviter.telegramId
					}
				}

				const referralCode = uuidv4().slice(0, 8)

				const createdUser = await tx.user.create({
					data: {
						...userData,
						telegramId,
						referralCode,
						interest: { connect: { id: interestId } },
						photos: {
							connect: photoIds.map(id => ({ id })),
						},
						...(invitedById !== undefined
							? { invitedBy: { connect: { telegramId: invitedById } } }
							: {}),
					},
				})

				await tx.photo.updateMany({
					where: {
						tempTgId: telegramId,
						telegramId: null,
					},
					data: {
						telegramId,
						tempTgId: null,
					},
				})

				return successResponse('Пользователь создан и фото привязаны')
			})
		} catch (error) {
			return errorResponse('Ошибка при регистрации пользователя:', error)
		}
	}
}
